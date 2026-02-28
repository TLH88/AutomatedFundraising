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
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db.client import get_client, get_organizations, upsert_contact
from scraper.utils import (
    fetch_page, extract_emails_from_soup,
    extract_phone_from_soup, find_subpages
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Keep scraper behavior consistent with the server and discovery scripts.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

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

APOLLO_API_KEY = os.environ.get("APOLLO_API_KEY", "") or os.environ.get("APPLO_API_KEY", "")
APOLLO_BASE_URL = os.environ.get("APOLLO_API_BASE", "https://api.apollo.io")
APOLLO_HTTP_TIMEOUT_SECONDS = float(os.environ.get("APOLLO_HTTP_TIMEOUT_SECONDS", "12"))
APOLLO_ENABLED = os.environ.get("APOLLO_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
APOLLO_PREVIEW_PER_ORG_LIMIT = int(os.environ.get("APOLLO_PREVIEW_PER_ORG_LIMIT", "3"))
CONTACT_EXTRACTION_MAX_RUNTIME_SECONDS = float(os.environ.get("CONTACT_EXTRACTION_MAX_RUNTIME_SECONDS", "420"))
CONTACT_EXTRACTION_STAGE_MAX_SECONDS = float(os.environ.get("CONTACT_EXTRACTION_STAGE_MAX_SECONDS", "180"))


def apollo_configured() -> bool:
    return APOLLO_ENABLED and bool(APOLLO_API_KEY)


def _deadline_reached(deadline_ts: float | None) -> bool:
    return bool(deadline_ts and time.monotonic() >= deadline_ts)


def _effective_contact_deadline(deadline_ts: float | None = None, max_runtime_seconds: float | int | None = None) -> float:
    now = time.monotonic()
    candidates: list[float] = []
    if deadline_ts:
        candidates.append(float(deadline_ts))
    max_runtime = float(max_runtime_seconds if max_runtime_seconds not in (None, "") else CONTACT_EXTRACTION_MAX_RUNTIME_SECONDS)
    candidates.append(now + max(5.0, max_runtime))
    candidates.append(now + max(5.0, CONTACT_EXTRACTION_STAGE_MAX_SECONDS))
    return min(candidates)


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


def _apollo_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
        "accept": "application/json",
        "Cache-Control": "no-cache",
    }


def _domain_from_website(website: str | None) -> str:
    raw = str(website or "").strip()
    if not raw:
        return ""
    if not re.match(r"^https?://", raw, re.I):
        raw = f"https://{raw}"
    try:
        host = (urlparse(raw).hostname or "").lower().strip()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def _apollo_search_people(org: dict, per_org_limit: int = 5) -> list[dict]:
    """
    Query Apollo for people associated with an organization name/domain.
    Returns a normalized list of contact dicts (no DB writes).
    """
    if not apollo_configured():
        return []

    org_name = str(org.get("name") or "").strip()
    domain = _domain_from_website(org.get("website"))
    if not (org_name or domain):
        return []

    per_page = max(1, min(int(per_org_limit or 5), 10))
    params = {
        "page": 1,
        "per_page": per_page,
        "person_titles[]": [
            "Owner", "Founder", "President", "CEO", "Executive Director",
            "Community Relations", "Partnerships", "Development Director",
            "CSR", "Marketing Director", "Store Manager",
        ],
        "q_keywords": org_name,
    }
    if domain:
        params["q_organization_domains_list[]"] = [domain]
    if org_name:
        params["q_organization_name"] = org_name
    city = str(org.get("city") or "").strip()
    state = str(org.get("state") or "").strip()
    if city and state:
        params["organization_locations[]"] = [f"{city}, {state}, US"]

    # Apollo has shifted endpoint shapes over time; try primary then fallback path.
    endpoints = [
        "/mixed_people/api_search",
        "/api/v1/mixed_people/search",
    ]
    response_json = None
    for ep in endpoints:
        try:
            resp = requests.post(
                f"{APOLLO_BASE_URL.rstrip('/')}{ep}",
                headers=_apollo_headers(),
                params=params if "api_search" in ep else None,
                json=params if "api_search" not in ep else None,
                timeout=(5, APOLLO_HTTP_TIMEOUT_SECONDS),
            )
            if resp.status_code in (404, 405):
                continue
            resp.raise_for_status()
            response_json = resp.json() or {}
            break
        except Exception as exc:
            logger.warning("Apollo people search failed for '%s' via %s: %s", org_name or domain, ep, exc)
            continue
    if not isinstance(response_json, dict):
        return []

    people = response_json.get("people") or response_json.get("contacts") or []
    if not isinstance(people, list):
        return []

    out: list[dict] = []
    for p in people[: max(1, min(int(per_org_limit or 5), 10))]:
        if not isinstance(p, dict):
            continue
        enriched = _apollo_maybe_enrich_person(p, domain=domain)
        title = str(enriched.get("title") or p.get("title") or "General Contact").strip() or "General Contact"
        full_name = str(enriched.get("name") or p.get("name") or "").strip()
        if not full_name:
            first = str(enriched.get("first_name") or p.get("first_name") or "").strip()
            last = str(enriched.get("last_name") or p.get("last_name") or "").strip()
            full_name = " ".join([x for x in [first, last] if x]).strip()
        email = str(enriched.get("email") or p.get("email") or "").strip().lower()
        phone = (
            str(enriched.get("phone") or "").strip()
            or str(enriched.get("mobile_phone") or p.get("mobile_phone") or "").strip()
            or _apollo_pick_phone(enriched) or _apollo_pick_phone(p)
        )
        if not (email or full_name):
            continue
        confidence = "high" if email else "medium"
        out.append({
            "full_name": full_name or None,
            "title": title,
            "email": email or None,
            "phone": phone or None,
            "justification": "Discovered via Apollo person search/enrichment for the organization.",
            "confidence": confidence,
            "_apollo": True,
        })
    return out


def _apollo_pick_phone(person: dict | None) -> str | None:
    if not isinstance(person, dict):
        return None
    candidates = []
    for key in ("phone", "work_phone", "direct_phone", "sanitized_phone"):
        val = str(person.get(key) or "").strip()
        if val:
            candidates.append(val)
    for key in ("phone_numbers", "phones"):
        vals = person.get(key)
        if isinstance(vals, list):
            for item in vals:
                if isinstance(item, dict):
                    val = str(item.get("sanitized_number") or item.get("raw_number") or item.get("number") or "").strip()
                else:
                    val = str(item or "").strip()
                if val:
                    candidates.append(val)
    return candidates[0] if candidates else None


def _apollo_maybe_enrich_person(person: dict, domain: str = "") -> dict:
    """
    Best-effort Apollo person enrichment to improve email/phone reliability.
    Falls back to original payload if enrichment fails or lacks match inputs.
    """
    if not apollo_configured() or not isinstance(person, dict):
        return person or {}
    first = str(person.get("first_name") or "").strip()
    last = str(person.get("last_name") or "").strip()
    if not (first and last and domain):
        return person
    payload = {
        "first_name": first,
        "last_name": last,
        "domain": domain,
        "reveal_personal_emails": False,
        "reveal_phone_number": False,
    }
    try:
        resp = requests.post(
            f"{APOLLO_BASE_URL.rstrip('/')}/api/v1/people/match",
            headers=_apollo_headers(),
            json=payload,
            timeout=(5, APOLLO_HTTP_TIMEOUT_SECONDS),
        )
        resp.raise_for_status()
        data = resp.json() or {}
        return (data.get("person") or data.get("contact") or person) if isinstance(data, dict) else person
    except Exception:
        return person


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


def run_extraction(
    min_score: int = 5,
    org_ids: list[str] | None = None,
    org_limit: int | None = None,
    deadline_ts: float | None = None,
    max_runtime_seconds: float | int | None = None,
) -> int:
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

    effective_deadline = _effective_contact_deadline(
        deadline_ts=deadline_ts,
        max_runtime_seconds=max_runtime_seconds,
    )

    total_saved = 0
    for org in orgs:
        if _deadline_reached(effective_deadline):
            logger.warning("Contact extraction deadline reached; stopping early with partial results.")
            break
        org_id = org["id"]
        website = org.get("website", "")
        name = org.get("name", "Unknown")

        logger.info(f"  Processing: {name} ({website or 'no website'})")
        contacts = _dedupe_contacts_for_org(_apollo_search_people(org, per_org_limit=5), org)
        if _deadline_reached(effective_deadline):
            logger.warning("Contact extraction deadline reached after Apollo search; stopping early.")
            break
        if website:
            contacts.extend(extract_contacts_static(website, org_id))
        elif not contacts:
            logger.info(f"    ↳ No website available; Apollo returned no contacts.")
        if _deadline_reached(effective_deadline):
            logger.warning("Contact extraction deadline reached after static scraping; stopping early.")
            break

        # Fallback to Playwright if static yielded nothing
        if not contacts and website and not _deadline_reached(effective_deadline):
            contacts = extract_contacts_playwright(website, org_id)
        else:
            # If Apollo/static yielded some contacts, Playwright is optional and can be skipped for speed.
            pass
        contacts = _dedupe_contacts_for_org(contacts, org)

        for contact in contacts:
            if _deadline_reached(effective_deadline):
                logger.warning("Contact extraction deadline reached while saving contacts; stopping early.")
                logger.info(f"Extraction complete (partial). {total_saved} contacts saved.")
                return total_saved
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


def extract_contacts_preview_for_orgs(
    orgs: list[dict],
    per_org_limit: int = 5,
    deadline_ts: float | None = None,
    max_runtime_seconds: float | int | None = None,
) -> list[dict]:
    """
    Preview-mode extraction for discovery results (no DB writes).
    Returns contact candidates enriched with org metadata and a contact category.
    """
    results: list[dict] = []
    seen_keys: set[str] = set()
    existing_emails = _load_existing_contact_emails()
    effective_deadline = _effective_contact_deadline(
        deadline_ts=deadline_ts,
        max_runtime_seconds=max_runtime_seconds,
    )
    for org in (orgs or []):
        if _deadline_reached(effective_deadline):
            logger.warning("Contact preview extraction deadline reached; returning partial preview results.")
            break
        website = str(org.get("website") or "").strip()
        org_key = str(org.get("_preview_key") or org.get("id") or org.get("name") or "").strip()
        if not org_key:
            continue
        org_id_hint = str(org.get("id") or f"preview:{org_key}")
        contacts = _apollo_search_people(org, per_org_limit=min(max(1, int(per_org_limit or 5)), APOLLO_PREVIEW_PER_ORG_LIMIT))
        if _deadline_reached(effective_deadline):
            logger.warning("Contact preview extraction deadline reached after Apollo search; returning partial preview results.")
            break
        if website:
            contacts.extend(extract_contacts_static(website, org_id_hint))
        if _deadline_reached(effective_deadline):
            logger.warning("Contact preview extraction deadline reached after static scraping; returning partial preview results.")
            break
        if not contacts and website and not _deadline_reached(effective_deadline):
            contacts = extract_contacts_playwright(website, org_id_hint)
        contacts = _dedupe_contacts_for_org(contacts, org)
        for contact in (contacts or [])[: max(1, int(per_org_limit or 5))]:
            if _deadline_reached(effective_deadline):
                logger.warning("Contact preview extraction deadline reached while building preview records; returning partial results.")
                return results
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


def _dedupe_contacts_for_org(contacts: list[dict], org: dict | None = None) -> list[dict]:
    """Prefer Apollo-enriched contacts and unique email/name-title combos per org."""
    if not isinstance(contacts, list):
        return []
    seen: set[str] = set()
    ranked: list[tuple[int, dict]] = []
    for c in contacts:
        if not isinstance(c, dict):
            continue
        email = str(c.get("email") or "").strip().lower()
        full_name = str(c.get("full_name") or "").strip().lower()
        title = str(c.get("title") or "").strip().lower()
        if not (email or full_name):
            continue
        key = f"{email}|{full_name}|{title}"
        if key in seen:
            continue
        seen.add(key)
        score = 0
        if c.get("_apollo"):
            score += 5
        if email:
            score += 3
        if c.get("phone"):
            score += 2
        score += min(5, score_title(str(c.get("title") or "")))
        ranked.append((score, c))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [c for _, c in ranked]


if __name__ == "__main__":
    run_extraction()
