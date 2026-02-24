"""
scraper/extract_contacts.py
Contact extraction engine.
For each organization in Supabase, scrapes the org's website to find:
  - Contact person name + title
  - Email address
  - Phone number
  - Justification for selection

Uses BeautifulSoup4 for static pages.
Falls back to Playwright for JS-rendered pages.
"""

import os
import sys
import re
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db.client import get_client, get_organizations, upsert_contact
from scraper.utils import (
    fetch_page, extract_emails_from_soup,
    extract_phone_from_soup, find_subpages
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Roles we prioritize when scanning staff/team pages
PRIORITY_TITLES = [
    "chief executive", "ceo", "president", "executive director",
    "director of development", "director of giving", "vp of csr",
    "philanthropy", "corporate responsibility", "community relations",
    "communications", "outreach", "donations", "grants", "foundation",
    "partnerships", "marketing director", "cmo",
]

CONTACT_PAGE_KEYWORDS = [
    "contact", "about", "team", "staff", "leadership",
    "giving", "donate", "philanthropy", "csr", "foundation",
    "responsibility", "grant", "community",
]


def classify_contact_role(title: str | None) -> str:
    """Map a raw title to a user-facing contact category."""
    t = str(title or "").strip().lower()
    if not t:
        return "General Contact"
    if any(k in t for k in ["owner", "founder", "co-founder", "principal"]):
        return "Business Owner"
    if any(k in t for k in ["philanthropy", "giving", "development", "donations", "grants", "foundation"]):
        return "Giving Manager"
    if any(k in t for k in ["ceo", "chief executive", "president", "executive director", "director"]):
        return "Executive Leader"
    if any(k in t for k in ["community", "outreach", "partnership", "communications", "marketing"]):
        return "Community / Outreach Lead"
    return "Prospective Contact"


def _load_existing_contact_emails() -> set[str]:
    """Load existing contact emails to avoid surfacing existing contacts as new."""
    try:
        client = get_client()
    except Exception:
        return set()
    emails: set[str] = set()
    page = 0
    page_size = 1000
    while True:
        try:
            rows = (
                client.table("contacts")
                .select("email")
                .range(page * page_size, page * page_size + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception:
            return emails
        for row in rows:
            email = str((row or {}).get("email") or "").strip().lower()
            if email:
                emails.add(email)
        if len(rows) < page_size:
            break
        page += 1
        if page >= 50:
            break
    return emails


def score_title(title: str) -> int:
    """Return a priority score for a job title — higher = more relevant."""
    title_lower = title.lower()
    for i, kw in enumerate(PRIORITY_TITLES):
        if kw in title_lower:
            return len(PRIORITY_TITLES) - i
    return 0


def extract_contacts_static(website: str, org_id: str) -> list[dict]:
    """
    Scrape a website using BeautifulSoup4.
    Returns a list of contact dicts ready for Supabase.
    """
    contacts = []

    if not website:
        return contacts

    homepage = fetch_page(website)
    if not homepage:
        return contacts

    pages_to_scan = [website]

    # Find relevant subpages
    subpages = find_subpages(homepage, website, CONTACT_PAGE_KEYWORDS)
    pages_to_scan.extend(subpages[:6])  # cap to avoid runaway scraping

    all_emails = set()
    best_phone = None
    staff_entries = []

    for page_url in pages_to_scan:
        if page_url == website:
            soup = homepage
        else:
            soup = fetch_page(page_url)
            if not soup:
                continue

        # Extract emails
        emails = extract_emails_from_soup(soup)
        all_emails.update(emails)

        # Extract phone
        if not best_phone:
            best_phone = extract_phone_from_soup(soup)

        # Try to find named contacts
        staff_entries.extend(_find_staff_entries(soup))

    # Build contact records
    if staff_entries:
        # De-duplicate by name
        seen_names = set()
        for entry in staff_entries:
            name_key = entry.get("full_name", "").lower().strip()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)

            # Match email to person if possible, else use first available
            person_email = _match_email_to_person(entry, all_emails, website)

            contacts.append({
                "org_id": org_id,
                "full_name": entry.get("full_name"),
                "title": entry.get("title"),
                "email": person_email,
                "phone": best_phone,
                "justification": (
                    f"Identified via staff/team page as {entry.get('title', 'key contact')}. "
                    f"Relevant role for donation outreach."
                ),
                "confidence": "high" if person_email else "medium",
            })
    elif all_emails:
        # No named staff — use generic contact email
        best_email = _pick_best_email(all_emails)
        contacts.append({
            "org_id": org_id,
            "full_name": None,
            "title": "General Contact",
            "email": best_email,
            "phone": best_phone,
            "justification": "Best available contact email from website.",
            "confidence": "low",
        })

    return contacts


def _find_staff_entries(soup) -> list[dict]:
    """
    Heuristically extract staff name + title pairs from a page.
    Looks for common patterns: h3/h4 followed by p, divs with class
    patterns like 'team-member', 'staff-card', etc.
    """
    entries = []

    # Pattern 1: Structured team cards (div/article with name + title)
    card_patterns = [
        {"class_": re.compile(r"team|staff|person|member|bio|card", re.I)},
        {"itemtype": re.compile(r"Person", re.I)},
    ]
    for pattern in card_patterns:
        for card in soup.find_all(["div", "article", "li", "section"], **pattern):
            name_tag = card.find(["h2", "h3", "h4", "strong", "b"])
            title_tag = card.find(["p", "span"], class_=re.compile(r"title|role|position|job", re.I))
            if not title_tag:
                # Try second paragraph/span as title fallback
                all_text_tags = card.find_all(["p", "span"])
                if len(all_text_tags) >= 2:
                    title_tag = all_text_tags[1]
            if name_tag:
                name = name_tag.get_text(strip=True)
                title = title_tag.get_text(strip=True) if title_tag else ""
                if name and len(name) < 80 and score_title(title) > 0:
                    entries.append({"full_name": name, "title": title})

    # Pattern 2: Simple h3 + following p (common on smaller org sites)
    for heading in soup.find_all(["h3", "h4"]):
        sibling = heading.find_next_sibling(["p", "span"])
        if sibling:
            name = heading.get_text(strip=True)
            title = sibling.get_text(strip=True)
            if len(name) < 80 and score_title(title) > 0:
                entries.append({"full_name": name, "title": title})

    # Sort by priority title score, descending
    entries.sort(key=lambda e: score_title(e.get("title", "")), reverse=True)
    return entries[:10]  # return top 10 most relevant


def _match_email_to_person(entry: dict, emails: set, website: str) -> str | None:
    """
    Try to match an email from the pool to a specific person.
    Falls back to best generic email if no match.
    """
    name = entry.get("full_name", "")
    if not name:
        return _pick_best_email(emails)

    parts = name.lower().split()
    if not parts:
        return _pick_best_email(emails)

    first = parts[0]
    last = parts[-1] if len(parts) > 1 else ""

    # Try to find a matching email
    for email in emails:
        local = email.split("@")[0].lower()
        if first in local or (last and last in local):
            return email

    return _pick_best_email(emails)


def _pick_best_email(emails: set) -> str | None:
    """
    Pick the most relevant email from a set.
    Prefers fundraising/CSR/giving addresses over generic info@ etc.
    """
    if not emails:
        return None

    priority_keywords = ["giving", "donate", "csr", "philanthropy", "grants",
                         "foundation", "development", "partner"]
    secondary_keywords = ["contact", "hello", "info", "connect", "outreach"]
    avoid_keywords = ["noreply", "no-reply", "support", "help", "sales", "hr",
                      "jobs", "careers", "press", "media", "legal"]

    for kw in priority_keywords:
        for e in emails:
            if kw in e.lower():
                return e
    for kw in secondary_keywords:
        for e in emails:
            if kw in e.lower():
                return e
    # Return first that doesn't match avoid list
    for e in emails:
        if not any(kw in e.lower() for kw in avoid_keywords):
            return e
    return next(iter(emails))


def extract_contacts_playwright(website: str, org_id: str) -> list[dict]:
    """
    Playwright-based fallback for JS-rendered pages.
    Only called if static scraping yields zero contacts.
    Requires PLAYWRIGHT_ENABLED=true env var to activate.
    """
    if os.environ.get("PLAYWRIGHT_ENABLED", "false").lower() != "true":
        return []
    try:
        from playwright.sync_api import sync_playwright
        from bs4 import BeautifulSoup as BS

        logger.info(f"Using Playwright for: {website}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(website, timeout=20000)
            page.wait_for_load_state("networkidle")
            html = page.content()
            browser.close()

        soup = BS(html, "html.parser")
        # Reuse static extraction logic on rendered HTML
        all_emails = set(extract_emails_from_soup(soup))
        phone = extract_phone_from_soup(soup)
        staff = _find_staff_entries(soup)

        contacts = []
        for entry in staff[:5]:
            email = _match_email_to_person(entry, all_emails, website)
            contacts.append({
                "org_id": org_id,
                "full_name": entry.get("full_name"),
                "title": entry.get("title"),
                "email": email,
                "phone": phone,
                "justification": "Extracted via Playwright (JS-rendered page).",
                "confidence": "high" if email else "medium",
            })
        if not contacts and all_emails:
            contacts.append({
                "org_id": org_id,
                "full_name": None,
                "title": "General Contact",
                "email": _pick_best_email(all_emails),
                "phone": phone,
                "justification": "Best email from JS-rendered page.",
                "confidence": "low",
            })
        return contacts

    except Exception as e:
        logger.error(f"Playwright error for {website}: {e}")
        return []


def run_extraction(min_score: int = 5, org_ids: list[str] | None = None, org_limit: int | None = None) -> int:
    """
    Main entry point.
    Fetches orgs from Supabase, extracts contacts, upserts results.
    Returns count of contacts saved.
    """
    orgs = get_organizations(min_score=min_score)
    if org_ids:
        org_id_set = {str(x) for x in org_ids if x}
        orgs = [o for o in orgs if str(o.get("id")) in org_id_set]
    if org_limit:
        orgs = orgs[: max(1, int(org_limit))]
    logger.info(f"Found {len(orgs)} organizations to process.")

    total_saved = 0
    for org in orgs:
        org_id = org["id"]
        website = org.get("website", "")
        name = org.get("name", "Unknown")

        if not website:
            logger.info(f"  Skipping '{name}' — no website.")
            continue

        logger.info(f"  Processing: {name} ({website})")
        contacts = extract_contacts_static(website, org_id)

        # Fallback to Playwright if static yielded nothing
        if not contacts:
            contacts = extract_contacts_playwright(website, org_id)

        for contact in contacts:
            if not contact.get("email"):
                logger.info(f"    ↳ Skipping contact (no email): {contact.get('full_name')}")
                continue
            try:
                upsert_contact(contact)
                total_saved += 1
                logger.info(f"    ↳ Saved: {contact.get('full_name')} <{contact['email']}>")
            except Exception as e:
                logger.error(f"    ↳ DB error: {e}")

    logger.info(f"Extraction complete. {total_saved} contacts saved.")
    return total_saved


def extract_contacts_preview_for_orgs(orgs: list[dict], per_org_limit: int = 5) -> list[dict]:
    """
    Preview-mode extraction for discovery results (no DB writes).
    Returns contact candidates enriched with org metadata and a contact category.
    """
    results: list[dict] = []
    seen_keys: set[str] = set()
    existing_emails = _load_existing_contact_emails()
    for org in (orgs or []):
        website = str(org.get("website") or "").strip()
        if not website:
            continue
        org_key = str(org.get("_preview_key") or org.get("id") or org.get("name") or "").strip()
        if not org_key:
            continue
        org_id_hint = str(org.get("id") or f"preview:{org_key}")
        contacts = extract_contacts_static(website, org_id_hint)
        if not contacts:
            contacts = extract_contacts_playwright(website, org_id_hint)
        for contact in (contacts or [])[: max(1, int(per_org_limit or 5))]:
            email = str(contact.get("email") or "").strip().lower()
            full_name = str(contact.get("full_name") or "").strip()
            if email and email in existing_emails:
                continue
            dedupe_key = f"{org_key}|{email or full_name}|{str(contact.get('title') or '').strip().lower()}"
            if not (email or full_name) or dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)
            title = contact.get("title") or "General Contact"
            results.append({
                **contact,
                "record_type": "contact",
                "target_table": "contacts",
                "record_key": f"contact:{dedupe_key}",
                "category": classify_contact_role(title),
                "organization_name": org.get("name"),
                "organization_website": org.get("website"),
                "organization_address": org.get("address"),
                "organization_city": org.get("city"),
                "organization_state": org.get("state"),
                "organization_postal_code": org.get("postal_code"),
                "org_preview_key": org_key,
                "donation_potential_score": org.get("donation_potential_score"),
            })
    return results


if __name__ == "__main__":
    run_extraction()
