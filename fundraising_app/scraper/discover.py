"""
scraper/discover.py
Discovery engine for potential donor organizations.

Enhancements:
- Supports user-supplied discovery filters (location, radius, result limit, score)
- Stops once requested number of matching records is reached
- Optionally chains into contact extraction for newly discovered orgs
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import feedparser
import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db.client import get_client, upsert_contact, upsert_organization
from scraper.google_places import discover_google_places_nearby, google_places_configured
from scraper.llm_assist import (
    build_serpapi_queries,
    contact_justification as build_contact_justification,
    org_justification as build_org_justification,
    plan_source_types,
)
from scraper.utils import parse_search_location, geocode_location, within_radius_miles

# Load app-local environment so scraper runs match server behavior.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "")
DISCOVERY_MAX_RUNTIME_SECONDS = float(os.environ.get("DISCOVERY_MAX_RUNTIME_SECONDS", "420"))
SERPAPI_STAGE_MAX_SECONDS = float(os.environ.get("SERPAPI_STAGE_MAX_SECONDS", "90"))
SERPAPI_MAX_QUERY_FAILURES = int(os.environ.get("SERPAPI_MAX_QUERY_FAILURES", "4"))
SERPAPI_HTTP_TIMEOUT_SECONDS = float(os.environ.get("SERPAPI_HTTP_TIMEOUT_SECONDS", "8"))

SEARCH_QUERIES = [
    "pet industry company CSR charitable giving program",
    "vegan brand corporate social responsibility animal welfare donation",
    "animal welfare corporate sponsor national",
    "pet food company philanthropy grant program",
    "dog rescue corporate partner USA",
    "cat shelter corporate donor sponsor program",
    "humane society corporate partner donation",
    "ASPCA corporate sponsor program",
    "Best Friends Animal Society corporate partner",
    "Unique local companies known to be charitable",
]

SEED_ORGANIZATIONS = [
    {"name": "PetSmart Charities", "website": "https://www.petsmartcharities.org", "category": "pet_industry", "donation_potential_score": 10, "notes": "Dedicated animal welfare grant-making arm of PetSmart."},
    {"name": "Petco Love", "website": "https://petcolove.org", "category": "pet_industry", "donation_potential_score": 10, "notes": "Petco's charitable foundation. Grants to animal welfare orgs."},
    {"name": "Hill's Pet Nutrition Foundation", "website": "https://hillspet.com", "category": "pet_industry", "donation_potential_score": 9, "notes": "Science Diet maker. Active Food, Shelter, Love grant program."},
    {"name": "Purina Pro Plan Shelter Champions", "website": "https://proplanshelterstars.com", "category": "pet_industry", "donation_potential_score": 9, "notes": "Purina shelter support program - food and supplies."},
    {"name": "Royal Canin USA", "website": "https://www.royalcanin.com/us", "category": "pet_industry", "donation_potential_score": 8, "notes": "Partners with shelters and rescues for product donations."},
    {"name": "Banfield Foundation", "website": "https://banfieldfoundation.org", "category": "pet_industry", "donation_potential_score": 9, "notes": "Funds preventive veterinary care at shelters."},
    {"name": "Zoetis Petcare", "website": "https://www.zoetispetcare.com", "category": "pet_industry", "donation_potential_score": 8, "notes": "Animal health company with shelter support programs."},
    {"name": "Tractor Supply Company Foundation", "website": "https://www.tractorsupply.com", "category": "pet_industry", "donation_potential_score": 7, "notes": "Annual Rescue Express program supports shelters."},
    {"name": "KONG Company", "website": "https://www.kongcompany.com", "category": "pet_industry", "donation_potential_score": 7, "notes": "Donates products to shelters and rescue groups."},
    {"name": "Kuranda Dog Beds", "website": "https://www.kuranda.com", "category": "pet_industry", "donation_potential_score": 6, "notes": "Shelter dog bed donation program."},
    {"name": "Beyond Meat", "website": "https://www.beyondmeat.com", "category": "vegan_brand", "donation_potential_score": 7, "notes": "Vegan brand with documented animal welfare giving."},
    {"name": "Impossible Foods", "website": "https://www.impossiblefoods.com", "category": "vegan_brand", "donation_potential_score": 7, "notes": "Mission-aligned brand; has supported animal welfare causes."},
    {"name": "Oatly", "website": "https://www.oatly.com", "category": "vegan_brand", "donation_potential_score": 6, "notes": "Values-driven brand; open to animal welfare co-promotion."},
    {"name": "Amazon (AmazonSmile / AWS Imagine Grant)", "website": "https://www.amazon.com/gp/charity", "category": "corporate_csr", "donation_potential_score": 8, "notes": "AmazonSmile donates 0.5% of purchases to nonprofits."},
    {"name": "Google.org", "website": "https://www.google.org", "category": "corporate_csr", "donation_potential_score": 7, "notes": "Google's philanthropic arm. Grants to nonprofits."},
    {"name": "Salesforce.org", "website": "https://www.salesforce.org", "category": "corporate_csr", "donation_potential_score": 7, "notes": "1-1-1 model. Grants + free tech to nonprofits."},
    {"name": "Microsoft Philanthropies", "website": "https://www.microsoft.com/en-us/philanthropies", "category": "corporate_csr", "donation_potential_score": 7, "notes": "Grants + in-kind tech to qualifying nonprofits."},
    {"name": "Maddie's Fund", "website": "https://www.maddiesfund.org", "category": "foundation", "donation_potential_score": 10, "notes": "Leading funder of animal shelter and rescue innovation."},
    {"name": "Petfinder Foundation", "website": "https://www.petfinderfoundation.com", "category": "foundation", "donation_potential_score": 9, "notes": "Direct grants to shelters and rescues."},
    {"name": "American Humane", "website": "https://www.americanhumane.org", "category": "nonprofit", "donation_potential_score": 8, "notes": "Grant programs and partnerships for shelters."},
    {"name": "Doris Day Animal Foundation", "website": "https://www.dorisdayanimalfoundation.org", "category": "foundation", "donation_potential_score": 8, "notes": "Grants to companion animal shelters and spay/neuter programs."},
    {"name": "Grey Muzzle Organization", "website": "https://www.greymuzzle.org", "category": "foundation", "donation_potential_score": 7, "notes": "Grants specifically for senior dog programs at shelters."},
    {"name": "PetSafe Foundation", "website": "https://www.petsafe.net", "category": "pet_industry", "donation_potential_score": 7, "notes": "Product donations and grants to animal welfare orgs."},
]


def search_via_serpapi(query: str, num: int = 10, location_query: str | None = None) -> list[dict]:
    """Use SerpAPI organic search as a secondary enrichment source.

    We intentionally do not send SerpAPI's `location` parameter here because it
    has been unreliable for city/state inputs in this workflow and causes many
    400/retry cycles. Location context is kept in the query text instead.
    """
    if not SERPAPI_KEY:
        return []
    try:
        # SerpAPI Google organic returns relatively small pages. Pull multiple pages
        # when a larger result set is requested, but cap for performance/cost.
        target = max(1, min(int(num or 10), 100))
        orgs: list[dict] = []
        start = 0
        while len(orgs) < target:
            batch_size = min(10, target - len(orgs))
            params = {"q": query, "api_key": SERPAPI_KEY, "num": batch_size, "engine": "google"}
            if start > 0:
                params["start"] = start
            resp = requests.get(
                "https://serpapi.com/search",
                params=params,
                timeout=(5, SERPAPI_HTTP_TIMEOUT_SECONDS),
            )
            resp.raise_for_status()
            payload = resp.json() or {}
            results = payload.get("organic_results", []) or []
            if not results:
                break
            for r in results:
                if len(orgs) >= target:
                    break
                orgs.append({
                    "name": r.get("title", "")[:200],
                    "website": r.get("link", ""),
                    "category": "other",
                    "donation_potential_score": 5,
                    "notes": r.get("snippet", "")[:500],
                    "_source": "serpapi_google",
                    "_source_query": query,
                    "_source_location_query": location_query,
                    "_location_hint_applied": bool(location_query),
                })
            if len(results) < batch_size:
                break
            start += len(results)
        return orgs
    except Exception as e:
        logger.warning("SerpAPI error for query '%s': %s", query, e)
        return []


def fetch_petfinder_orgs() -> list[dict]:
    """Pull shelter listings from Petfinder RSS-like listing page parsing."""
    feed_url = "https://www.petfinder.com/animal-shelters-and-rescues/search/?country=US"
    try:
        feed = feedparser.parse(feed_url)
        orgs = []
        for entry in feed.entries[:50]:
            orgs.append({
                "name": entry.get("title", "Unknown")[:200],
                "website": entry.get("link", ""),
                "category": "nonprofit",
                "donation_potential_score": 5,
                "notes": "Petfinder-listed shelter.",
            })
        return orgs
    except Exception as e:
        logger.warning("Petfinder RSS error: %s", e)
        return []


def _normalize_min_score(score_input: int | str | None) -> int:
    if score_input in (None, "", "all"):
        return 1
    raw = str(score_input).strip().replace(">=", "").replace(">", "").strip()
    try:
        score = int(float(raw))
    except Exception:
        return 1
    if score > 10:
        return max(1, min(10, (score + 9) // 10))
    return max(1, min(10, score or 1))


def _normalize_result_limit(limit: int | str | None) -> int:
    try:
        value = int(limit or 100)
    except Exception:
        value = 100
    return max(1, min(1000, value))


def _normalize_org_score(score: Any) -> int:
    try:
        n = int(float(score or 0))
    except Exception:
        n = 0
    if n > 10:
        return max(1, min(10, (n + 9) // 10))
    return n


def _ui_score(score: Any) -> int:
    n = _normalize_org_score(score)
    return n * 10 if n <= 10 else n


def _format_org_for_ui(org: dict) -> dict:
    city, state, postal = _extract_location_fields(org)
    return {
        "record_type": "organization",
        "target_table": "organizations",
        "record_key": _stable_org_record_key(org),
        "id": org.get("id"),
        "name": org.get("name"),
        "website": org.get("website"),
        "category": org.get("category") or "other",
        "donation_potential_score": _ui_score(org.get("donation_potential_score")),
        "address": org.get("address"),
        "city": org.get("city") or city or None,
        "state": org.get("state") or state or None,
        "postal_code": org.get("postal_code") or postal or None,
        "latitude": org.get("latitude"),
        "longitude": org.get("longitude"),
        "email": org.get("email"),
        "phone": org.get("phone"),
        "justification": org.get("justification"),
        "additional_info": org.get("additional_info"),
        "source_notes": org.get("notes"),
        "notes": org.get("notes"),
        "created_at": org.get("created_at"),
        "updated_at": org.get("updated_at"),
    }


def _format_contact_for_ui(contact: dict) -> dict:
    return {
        "record_type": "contact",
        "target_table": "contacts",
        "record_key": contact.get("record_key"),
        "id": contact.get("id"),
        "name": contact.get("full_name") or contact.get("email") or "Unnamed Contact",
        "full_name": contact.get("full_name"),
        "title": contact.get("title"),
        "category": contact.get("category") or "Prospective Contact",
        "donation_potential_score": _ui_score(contact.get("donation_potential_score")),
        "email": contact.get("email"),
        "phone": contact.get("phone"),
        "notes": contact.get("justification"),
        "confidence": contact.get("confidence"),
        "organization_name": contact.get("organization_name"),
        "organization_website": contact.get("organization_website"),
        "organization_address": contact.get("organization_address"),
        "organization_city": contact.get("organization_city"),
        "organization_state": contact.get("organization_state"),
        "organization_postal_code": contact.get("organization_postal_code"),
        "org_preview_key": contact.get("org_preview_key"),
    }


def _preview_org_key(org: dict) -> str:
    return str(org.get("id") or [org.get("name"), org.get("website"), org.get("address"), org.get("city"), org.get("state")]).strip()


def _stable_org_record_key(org: dict) -> str:
    place_id = str(org.get("_google_place_id") or "").strip().lower()
    if place_id:
        return f"organization|google_place|{place_id}"
    parts = [
        str(org.get("name") or "").strip().lower(),
        str(org.get("website") or "").strip().lower(),
        str(org.get("address") or "").strip().lower(),
        str(org.get("city") or "").strip().lower(),
        str(org.get("state") or "").strip().lower(),
    ]
    return "organization|" + "|".join(parts)


def _attach_preview_keys(orgs: list[dict]) -> list[dict]:
    out = []
    for idx, org in enumerate(orgs or []):
        copy = dict(org or {})
        copy["_preview_key"] = str(copy.get("_preview_key") or f"org-preview-{idx}-{(copy.get('name') or 'org')}")
        out.append(copy)
    return out


def _build_preview_results(orgs: list[dict], contact_candidates: list[dict]) -> list[dict]:
    rows = [_format_org_for_ui(o) for o in (orgs or [])]
    rows.extend(_format_contact_for_ui(c) for c in (contact_candidates or []))
    return rows


def _score_passes(org: dict, min_score_10: int) -> bool:
    return _normalize_org_score(org.get("donation_potential_score")) >= min_score_10


def _db_org_payload(org: dict) -> dict:
    """Strip internal metadata fields before DB upsert."""
    allowed = {
        "name", "website", "category", "donation_potential_score",
        "address", "city", "state", "postal_code", "latitude", "longitude",
        "email", "phone", "notes",
    }
    payload = {k: v for k, v in org.items() if k in allowed}
    if "donation_potential_score" in payload:
        payload["donation_potential_score"] = _normalize_org_score(payload.get("donation_potential_score"))
    return payload


def _normalize_discovery_mode(mode: str | None) -> str:
    m = str(mode or "businesses").strip().lower().replace("-", "_")
    aliases = {
        "all": "all",
        "business": "businesses",
        "businesses": "businesses",
        "foundations": "foundations",
        "foundation": "foundations",
        "nonprofit": "nonprofits",
        "nonprofits": "nonprofits",
        "wealth": "wealth_related",
        "wealth_related": "wealth_related",
        "wealthrelated": "wealth_related",
    }
    return aliases.get(m, "businesses")


def _source_key(org: dict) -> str:
    raw = str(org.get("_source") or "seed").lower()
    if raw.startswith("google_places"):
        return "google_places"
    if raw.startswith("serpapi"):
        return "serpapi"
    if raw.startswith("petfinder"):
        return "petfinder"
    return "seed"


def _count_sources(orgs: list[dict]) -> dict:
    counts = {"google_places": 0, "serpapi": 0, "seed": 0, "petfinder": 0}
    for org in orgs:
        key = _source_key(org)
        counts[key] = counts.get(key, 0) + 1
    return counts


def _zero_source_counts() -> dict:
    return {"google_places": 0, "serpapi": 0, "seed": 0, "petfinder": 0}


def _load_existing_org_record_keys() -> set[str]:
    """Load stable organization keys from DB to avoid surfacing existing records as new."""
    try:
        client = get_client()
    except Exception:
        return set()
    keys: set[str] = set()
    page = 0
    page_size = 1000
    while True:
        try:
            rows = (
                client.table("organizations")
                .select("id,name,website,address,city,state")
                .range(page * page_size, page * page_size + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception:
            return keys
        for row in rows:
            keys.add(_stable_org_record_key(row))
        if len(rows) < page_size:
            break
        page += 1
        if page >= 50:  # safety cap
            break
    return keys


def _matches_discovery_mode(org: dict, discovery_mode: str) -> bool:
    mode = _normalize_discovery_mode(discovery_mode)
    if mode == "all":
        return True

    category = str(org.get("category") or "").lower()
    name = str(org.get("name") or "").lower()
    notes = str(org.get("notes") or "").lower()
    primary_type = str(org.get("_google_primary_type") or "").lower()
    types = {str(t).lower() for t in (org.get("_google_types") or [])}
    tokens = {category, primary_type} | types

    if mode == "foundations":
        if category == "foundation":
            return True
        if any(k in name for k in ["foundation", "charitable trust", "endowment"]):
            return True
        if "nonprofit_organization" in types and "foundation" in notes:
            return True
        return False

    if mode == "nonprofits":
        return category in {"nonprofit", "foundation"} or "nonprofit_organization" in types or "nonprofit" in notes

    if mode == "wealth_related":
        wealth_tokens = {
            "bank", "accounting", "insurance_agency", "real_estate_agency", "lawyer",
            "financial", "financial_planner", "investment_service", "corporate_csr",
        }
        return bool(tokens & wealth_tokens) or any(k in name for k in ["capital", "wealth", "invest", "holdings", "advisors"])

    # businesses (default)
    if category in {"local_business", "corporate_csr", "pet_industry", "financial"}:
        return True
    if category in {"foundation", "nonprofit"}:
        return False
    return True


def _extract_location_fields(org: dict) -> tuple[str, str, str]:
    city = str(org.get("city") or "").strip()
    state = str(org.get("state") or "").strip().upper()
    postal = str(org.get("postal_code") or "").strip()
    text = " ".join([str(org.get("address") or ""), str(org.get("notes") or "")])
    if (not city or not state) and text:
        m = re.search(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s*,\s*([A-Z]{2})\b", text)
        if m:
            city = city or m.group(1).strip()
            state = state or m.group(2).upper()
    if not postal and text:
        m_zip = re.search(r"\b(\d{5})(?:-\d{4})?\b", text)
        if m_zip:
            postal = m_zip.group(1)
    return city, state, postal


def _location_passes(org: dict, location_filter: dict, origin_geo: dict | None, radius_miles: float | None) -> bool:
    if not location_filter.get("raw"):
        return True

    if origin_geo and within_radius_miles(origin_geo, org.get("latitude"), org.get("longitude"), radius_miles):
        return True

    city, state, postal = _extract_location_fields(org)
    zip_code = location_filter.get("zip_code")
    if zip_code:
        searchable = " ".join([postal, str(org.get("address") or ""), str(org.get("notes") or "")]).lower()
        return zip_code.lower() in searchable

    wanted_city = str(location_filter.get("city") or "").lower()
    wanted_state = str(location_filter.get("state") or "").lower()
    if wanted_city and city.lower() != wanted_city:
        return False
    if wanted_state and state.lower() != wanted_state:
        return False

    if city or state:
        return True
    # Important fallback: localized SerpAPI searches often return candidates without
    # structured city/state fields in the snippet. If the query itself was location-
    # scoped, allow provisional inclusion so we don't incorrectly drop all results.
    if org.get("_location_hint_applied"):
        return True
    # Fallback if org lacks structured location fields but notes/snippet include the raw query text.
    return location_filter.get("raw", "").lower() in str(org.get("notes") or "").lower()


def _dedupe_orgs(orgs: list[dict]) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for org in orgs:
        name = str(org.get("name") or "").strip().lower()
        website = str(org.get("website") or "").strip().lower()
        if not name:
            continue
        key = (name, website)
        if key in seen:
            continue
        seen.add(key)
        unique.append(org)
    return unique


def _collect_candidates(
    location_filter: dict,
    per_query: int,
    origin_geo: dict | None = None,
    radius_miles: float | None = None,
    result_limit: int = 100,
    progress_cb=None,
    deadline_ts: float | None = None,
) -> list[dict]:
    all_orgs: list[dict] = []

    if google_places_configured() and origin_geo and radius_miles:
        logger.info("Running Google Places nearby discovery (coordinates-first)...")
        try:
            gp_orgs = discover_google_places_nearby(
                origin_lat=float(origin_geo["latitude"]),
                origin_lng=float(origin_geo["longitude"]),
                radius_miles=float(radius_miles),
                result_limit=result_limit,
                deadline_ts=deadline_ts,
                progress_cb=progress_cb,
            )
            logger.info("  Google Places -> %s candidates", len(gp_orgs))
            all_orgs.extend(gp_orgs)
        except Exception as e:
            logger.warning("Google Places discovery error: %s", e)
    elif origin_geo and radius_miles and not google_places_configured():
        logger.info("GOOGLE_MAPS_API_KEY not set -> skipping Google Places nearby discovery.")

    logger.info("Loading %s seed organizations...", len(SEED_ORGANIZATIONS))
    all_orgs.extend(SEED_ORGANIZATIONS)

    if SERPAPI_KEY:
        logger.info("Running Google searches via SerpAPI (secondary source, location scoped in query text)...")
        location_query = location_filter.get("query")
        serpapi_started = time.monotonic()
        serpapi_failures = 0
        dynamic_queries = build_serpapi_queries(SEARCH_QUERIES, location_filter.get("_source_plan") or {}, location_query=location_query)
        for localized_query in dynamic_queries:
            if deadline_ts and time.monotonic() >= deadline_ts:
                logger.info("Global discovery deadline reached before finishing SerpAPI queries; continuing with collected sources.")
                if callable(progress_cb):
                    progress_cb({
                        "step": "serpapi",
                        "status": "warning",
                        "message": "Stopped SerpAPI early (global time budget reached). Continuing with collected candidates.",
                        "progress": 40,
                        "source": "serpapi",
                        "stopped_early": True,
                        "stop_reason": "global_deadline",
                    })
                break
            if (time.monotonic() - serpapi_started) >= max(1.0, SERPAPI_STAGE_MAX_SECONDS):
                logger.info("SerpAPI stage time budget reached; continuing with collected sources.")
                if callable(progress_cb):
                    progress_cb({
                        "step": "serpapi",
                        "status": "warning",
                        "message": "Stopped SerpAPI early (stage time budget reached). Continuing with collected candidates.",
                        "progress": 40,
                        "source": "serpapi",
                        "stopped_early": True,
                        "stop_reason": "serpapi_stage_deadline",
                    })
                break
            results = search_via_serpapi(localized_query, num=per_query, location_query=location_query)
            logger.info("  '%s...' -> %s results", localized_query[:60], len(results))
            if not results:
                serpapi_failures += 1
            else:
                serpapi_failures = 0
            all_orgs.extend(results)
            if serpapi_failures >= max(1, SERPAPI_MAX_QUERY_FAILURES):
                logger.info("SerpAPI failure budget reached; continuing with collected sources.")
                if callable(progress_cb):
                    progress_cb({
                        "step": "serpapi",
                        "status": "warning",
                        "message": "Stopped SerpAPI early after repeated failures/timeouts. Continuing with collected candidates.",
                        "progress": 40,
                        "source": "serpapi",
                        "stopped_early": True,
                        "stop_reason": "serpapi_failure_budget",
                    })
                break
    else:
        logger.info("SERPAPI_KEY not set -> skipping Google search.")

    logger.info("Fetching Petfinder organization listings...")
    pf_orgs = fetch_petfinder_orgs()
    logger.info("  Petfinder -> %s orgs", len(pf_orgs))
    all_orgs.extend(pf_orgs)
    deduped = _dedupe_orgs(all_orgs)
    if callable(progress_cb):
        progress_cb({
            "step": "collecting_sources",
            "status": "running",
            "message": f"Collected {len(deduped)} unique candidates across discovery sources.",
            "progress": 42,
            "source_counts": _count_sources(deduped),
        })
    return deduped


def import_discovery_results(
    records: list[dict],
    *,
    extract_contacts: bool = False,
    min_score: int | str | None = None,
    progress_cb=None,
) -> dict:
    """Import mixed preview results (organizations + contacts) after user confirmation."""
    def emit(step: str, status: str, message: str, progress: int | None = None, **extra):
        if not callable(progress_cb):
            return
        payload = {"step": step, "status": status, "message": message}
        if progress is not None:
            payload["progress"] = max(0, min(100, int(progress)))
        payload.update(extra)
        try:
            progress_cb(payload)
        except Exception:
            pass

    preview_records = [r for r in (records or []) if isinstance(r, dict) and str(r.get("record_type") or "").strip()]
    org_preview = [r for r in preview_records if str(r.get("record_type")).lower() == "organization" and str(r.get("name") or "").strip()]
    contact_preview = [r for r in preview_records if str(r.get("record_type")).lower() == "contact"]
    emit("import_prepare", "running", f"Preparing {len(org_preview)} organizations and {len(contact_preview)} contacts for import...", 5)

    saved_rows: list[dict] = []
    saved_contact_rows: list[dict] = []
    saved_ids: list[str] = []
    issues: list[str] = []
    source_counts = _zero_source_counts()
    org_map: dict[str, dict] = {}

    emit("import_upserting", "running", f"Importing {len(org_preview)} organization(s)...", 15)
    for idx, org in enumerate(org_preview, 1):
        try:
            saved = upsert_organization(_db_org_payload(org))
            if isinstance(saved, dict):
                saved_rows.append(saved)
                if saved.get("id"):
                    saved_ids.append(str(saved.get("id")))
                for key in [str(org.get("record_key") or ""), str(org.get("_preview_key") or ""), str(org.get("id") or ""), str(org.get("name") or "")]:
                    if key:
                        org_map[key] = saved
            k = _source_key(org)
            source_counts[k] = source_counts.get(k, 0) + 1
            pct = 15 + int((idx / max(1, len(org_preview) or 1)) * 45)
            emit("import_upserting", "running", f"Imported {idx}/{len(org_preview)} organizations...", pct, saved_count=len(saved_rows), source_counts=source_counts)
        except Exception as exc:
            msg = f"{org.get('name') or 'Unknown'}: {exc}"
            issues.append(msg)
            logger.error("Explorer import failed for '%s': %s", org.get("name"), exc)
            emit("import_upserting", "warning", f"Issue importing {org.get('name') or 'record'}: {exc}", None, saved_count=len(saved_rows))

    emit("import_contacts", "running", f"Importing {len(contact_preview)} selected contact(s)...", 65)
    for idx, contact in enumerate(contact_preview, 1):
        try:
            org_ref = (
                str(contact.get("org_preview_key") or "")
                or str(contact.get("organization_name") or "")
            )
            linked_org = org_map.get(org_ref)
            if not linked_org and contact.get("organization_name"):
                # Ensure an org exists for imported contact-only selections.
                linked_org = upsert_organization(_db_org_payload({
                    "name": contact.get("organization_name"),
                    "website": contact.get("organization_website"),
                    "address": contact.get("organization_address"),
                    "city": contact.get("organization_city"),
                    "state": contact.get("organization_state"),
                    "postal_code": contact.get("organization_postal_code"),
                    "donation_potential_score": contact.get("donation_potential_score"),
                    "category": "other",
                }))
                if isinstance(linked_org, dict):
                    org_map[org_ref] = linked_org
            org_id = (linked_org or {}).get("id")
            payload = {
                "org_id": org_id,
                "full_name": contact.get("full_name"),
                "title": contact.get("title"),
                "email": contact.get("email"),
                "phone": contact.get("phone"),
                "justification": contact.get("notes") or contact.get("justification"),
                "confidence": contact.get("confidence") or "low",
            }
            if not payload.get("email"):
                continue
            saved_contact = upsert_contact(payload)
            if isinstance(saved_contact, dict):
                saved_contact_rows.append({**contact, **saved_contact})
            pct = 65 + int((idx / max(1, len(contact_preview))) * (20 if not extract_contacts else 10))
            emit("import_contacts", "running", f"Imported {idx}/{len(contact_preview)} selected contacts...", pct, contact_saved_count=len(saved_contact_rows))
        except Exception as exc:
            issues.append(f"Contact {contact.get('full_name') or contact.get('email')}: {exc}")
            logger.error("Explorer import failed for contact '%s': %s", contact.get("email") or contact.get("full_name"), exc)

    contacts_extracted = False
    if extract_contacts and saved_ids:
        try:
            from scraper.extract_contacts import run_extraction
            min_score_10 = _normalize_min_score(min_score)
            emit("import_contacts_extract", "running", f"Extracting contacts for {len(saved_ids)} imported organization(s)...", 88, saved_count=len(saved_rows))
            run_extraction(
                min_score=min_score_10,
                org_ids=saved_ids,
                org_limit=len(saved_ids),
                deadline_ts=deadline_ts,
                max_runtime_seconds=max_runtime,
            )
            contacts_extracted = True
            emit("import_contacts_extract", "running", "Contact extraction complete.", 97, saved_count=len(saved_rows))
        except Exception as exc:
            issues.append(f"Contact extraction: {exc}")
            logger.error("Explorer import contact extraction failed: %s", exc)
            emit("import_contacts_extract", "warning", f"Contact extraction issue: {exc}", 97, saved_count=len(saved_rows))

    emit("complete", "completed", f"Imported {len(saved_rows)} organizations and {len(saved_contact_rows)} contacts.", 100, saved_count=len(saved_rows))
    return {
        "requested_count": len(preview_records),
        "saved_count": len(saved_rows),
        "saved_contact_count": len(saved_contact_rows),
        "saved_org_ids": saved_ids,
        "organizations": [_format_org_for_ui(r) for r in saved_rows],
        "contacts": [_format_contact_for_ui(c) for c in saved_contact_rows],
        "contacts_extracted": contacts_extracted,
        "issues": issues,
        "source_breakdown": {"saved": source_counts},
    }


def run_discovery(
    location: str | None = None,
    radius_miles: float | int | None = None,
    limit: int | str | None = 100,
    min_score: int | str | None = 1,
    extract_contacts: bool = False,
    dry_run: bool = False,
    return_details: bool = False,
    discovery_mode: str | None = "businesses",
    progress_cb=None,
    max_runtime_seconds: float | int | None = None,
    exclude_record_keys: list[str] | None = None,
) -> int | dict:
    """
    Discover and save organizations with optional filters.

    location: City+State (e.g. 'Portland OR') or ZIP code
    radius_miles: Used when org coordinates exist; otherwise text-location fallback is applied.
    limit: hard stop on matched records saved (or returned in dry-run)
    min_score: supports 1-10 scraper scale or 0-100 UI scale (e.g. 80)
    """
    def emit(step: str, status: str, message: str, progress: int | None = None, **extra):
        if not callable(progress_cb):
            return
        payload = {"step": step, "status": status, "message": message}
        if progress is not None:
            payload["progress"] = max(0, min(100, int(progress)))
        payload.update(extra)
        try:
            progress_cb(payload)
        except Exception:
            pass

    emit("starting", "running", "Preparing discovery filters...", 2)
    max_runtime = float(max_runtime_seconds if max_runtime_seconds not in (None, "") else DISCOVERY_MAX_RUNTIME_SECONDS)
    deadline_ts = time.monotonic() + max(5.0, max_runtime)
    limit_n = _normalize_result_limit(limit)
    min_score_10 = _normalize_min_score(min_score)
    discovery_mode_n = _normalize_discovery_mode(discovery_mode)
    excluded_keys = {str(x).strip().lower() for x in (exclude_record_keys or []) if str(x).strip()}
    radius_n = float(radius_miles) if radius_miles not in (None, "") else None
    location_filter = parse_search_location(location)
    source_plan = plan_source_types({
        "location": location_filter.get("raw") or location_filter.get("query"),
        "radius_miles": radius_n,
        "min_score": min_score,
        "discovery_mode": discovery_mode_n,
    })
    location_filter["_source_plan"] = source_plan
    emit("geocoding", "running", "Geocoding search origin...", 5, location=location_filter.get("query") or None)
    origin_geo = geocode_location(location_filter.get("query")) if location_filter.get("query") else None

    logger.info(
        "Discovery filters -> location=%s radius=%s limit=%s min_score_10=%s mode=%s geocoded=%s planner=%s",
        location_filter.get("query") or None,
        radius_n,
        limit_n,
        min_score_10,
        discovery_mode_n,
        bool(origin_geo),
        source_plan.get("planner"),
    )
    emit(
        "planning",
        "running",
        f"Source targeting plan ready ({source_plan.get('planner', 'heuristic')}).",
        8,
        planner=source_plan.get("planner"),
        source_types=source_plan.get("source_types") or [],
    )

    emit("collecting_sources", "running", f"Collecting candidates for mode '{discovery_mode_n}'...", 10, discovery_mode=discovery_mode_n)
    # Pull more discovery candidates when the user requests a larger limit.
    # Organic search is still not enough for \"thousands\" by itself, but this avoids
    # the previous artificial 10-result/query cap.
    collect_target = min(1000, max(limit_n * 8, 120))
    per_query_target = min(100, max(10, ((collect_target // max(1, len(SEARCH_QUERIES))) + 5)))
    candidates = _collect_candidates(
        location_filter=location_filter,
        per_query=per_query_target,
        origin_geo=origin_geo,
        radius_miles=radius_n,
        result_limit=collect_target,
        progress_cb=progress_cb,
        deadline_ts=deadline_ts,
    )
    logger.info("Collected %s unique candidates before filtering.", len(candidates))
    existing_org_keys = _load_existing_org_record_keys()
    if existing_org_keys:
        emit("dedupe", "running", f"Loaded {len(existing_org_keys)} existing organizations for new-source dedupe.", 50, existing_org_keys=len(existing_org_keys))
    emit("filtering", "running", f"Filtering {len(candidates)} candidates by mode, score, and location...", 55, candidates=len(candidates), discovery_mode=discovery_mode_n)

    matched: list[dict] = []
    for idx, org in enumerate(candidates, 1):
        if time.monotonic() >= deadline_ts:
            emit("filtering", "warning", "Global search time budget reached during filtering. Returning best partial results.", 62, stopped_early=True, stop_reason="global_deadline")
            break
        if not _matches_discovery_mode(org, discovery_mode_n):
            continue
        if not _score_passes(org, min_score_10):
            continue
        if not _location_passes(org, location_filter, origin_geo, radius_n):
            continue
        if existing_org_keys and _stable_org_record_key(org) in existing_org_keys:
            continue
        if excluded_keys and _stable_org_record_key(org) in excluded_keys:
            continue
        matched.append(org)
        if idx % 5 == 0 or len(matched) == 1:
            emit("filtering", "running", f"Matched {len(matched)} organization(s) so far...", 60, matched=len(matched), source_counts=_count_sources(matched), discovery_mode=discovery_mode_n)
        if len(matched) >= limit_n:
            logger.info("Reached requested result limit during filtering (%s).", limit_n)
            break

    logger.info("%s organizations matched filters (cap=%s).", len(matched), limit_n)
    for org in matched:
        try:
            j = build_org_justification(org, {
                "location": location_filter.get("raw") or location_filter.get("query"),
                "radius_miles": radius_n,
                "min_score": min_score,
                "discovery_mode": discovery_mode_n,
            })
            org["justification"] = j.get("justification")
            org["additional_info"] = j.get("additional_info")
        except Exception:
            pass
    matched_source_counts = _count_sources(matched)
    emit("filtered", "running", f"{len(matched)} organizations matched the search criteria.", 65, matched=len(matched), source_counts=matched_source_counts, discovery_mode=discovery_mode_n)
    if dry_run:
        matched = _attach_preview_keys(matched)
        preview_contacts: list[dict] = []
        try:
            from scraper.extract_contacts import extract_contacts_preview_for_orgs
            if time.monotonic() < deadline_ts:
                emit("contacts_preview", "running", f"Extracting contact previews for {len(matched)} organizations...", 80, matched=len(matched))
                # Respect remaining time by reducing org count if budget is low.
                remaining = max(0.0, deadline_ts - time.monotonic())
                preview_orgs = [_format_org_for_ui(o) | {"_preview_key": o.get("_preview_key")} for o in matched]
                if remaining < 30:
                    preview_orgs = preview_orgs[: max(1, min(5, len(preview_orgs)))]
                preview_contacts = extract_contacts_preview_for_orgs(
                    preview_orgs,
                    deadline_ts=deadline_ts,
                    max_runtime_seconds=max_runtime,
                )
                for c in preview_contacts:
                    c["justification"] = build_contact_justification(c, {"name": c.get("organization_name")})
                emit("contacts_preview", "running", f"Extracted {len(preview_contacts)} contact preview result(s).", 92, preview_contacts=len(preview_contacts))
            else:
                emit("contacts_preview", "warning", "Skipped contact preview extraction (global time budget reached).", 92, stopped_early=True, stop_reason="global_deadline")
        except Exception as e:
            logger.error("Preview contact extraction failed: %s", e)
            emit("contacts_preview", "warning", f"Contact preview extraction issue: {e}", 92)
        for i, org in enumerate(matched, 1):
            city, state, postal = _extract_location_fields(org)
            logger.info("DRY RUN %02d | %s | score=%s | %s %s %s", i, org.get("name"), org.get("donation_potential_score"), city or "-", state or "-", postal or "-")
        if return_details:
            emit("complete", "completed", f"Dry run complete with {len(matched)} matched organizations.", 100, matched=len(matched), dry_run=True)
            return {
                "saved_count": 0,
                "matched_count": len(matched),
                "organizations": [_format_org_for_ui(o) for o in matched],
                "contacts": [_format_contact_for_ui(c) for c in preview_contacts],
                "results": _build_preview_results(matched, preview_contacts),
                "filters_applied": {
                    "location": location_filter.get("raw") or None,
                    "radius_miles": radius_n,
                    "limit": limit_n,
                    "min_score": min_score,
                    "min_score_normalized": min_score_10,
                    "discovery_mode": discovery_mode_n,
                    "max_runtime_seconds": max_runtime,
                    "excluded_record_keys_count": len(excluded_keys),
                    "source_plan": source_plan,
                },
                "dry_run": True,
                "contacts_extracted": bool(preview_contacts),
                "source_breakdown": {"matched": matched_source_counts, "saved": {"google_places": 0, "serpapi": 0, "seed": 0, "petfinder": 0}},
            }
        return len(matched)

    success = 0
    saved_ids: list[str] = []
    saved_rows: list[dict] = []
    saved_source_counts = {"google_places": 0, "serpapi": 0, "seed": 0, "petfinder": 0}
    logger.info("Upserting up to %s matched organizations to Supabase...", len(matched))
    emit("upserting", "running", f"Importing {len(matched)} matched organizations...", 70, matched=len(matched))
    for org in matched:
        try:
            saved = upsert_organization(_db_org_payload(org))
            success += 1
            if isinstance(saved, dict):
                saved_rows.append(saved)
            if saved.get("id"):
                saved_ids.append(str(saved["id"]))
            k = _source_key(org)
            saved_source_counts[k] = saved_source_counts.get(k, 0) + 1
            if matched:
                pct = 70 + int((success / max(1, len(matched))) * (20 if not extract_contacts else 10))
                emit("upserting", "running", f"Imported {success}/{len(matched)} organizations...", pct, saved_count=success, matched=len(matched), source_counts=saved_source_counts)
            if success >= limit_n:
                logger.info("Reached requested result limit (%s). Stopping discovery upserts.", limit_n)
                break
        except Exception as e:
            logger.error("Failed to upsert '%s': %s", org.get("name"), e)
            emit("upserting", "warning", f"Issue importing {org.get('name')}: {e}", None, saved_count=success, matched=len(matched))

    contacts_ran = False
    if extract_contacts and saved_ids:
        try:
            from scraper.extract_contacts import run_extraction
            logger.info("Running contact extraction for %s discovered org(s)...", len(saved_ids))
            emit("contacts", "running", f"Extracting contacts for {len(saved_ids)} discovered organizations...", 90, saved_count=success)
            run_extraction(
                min_score=min_score_10,
                org_ids=saved_ids,
                org_limit=len(saved_ids),
                deadline_ts=deadline_ts,
                max_runtime_seconds=max_runtime,
            )
            contacts_ran = True
            emit("contacts", "running", "Contact extraction complete.", 97, saved_count=success)
        except Exception as e:
            logger.error("Contact extraction failed after discovery: %s", e)
            emit("contacts", "warning", f"Contact extraction issue: {e}", 97, saved_count=success)

    logger.info("Discovery complete. %s/%s matched orgs saved.", success, len(matched))
    emit("complete", "completed", f"Discovery finished. Imported {success} of {len(matched)} matched organizations.", 100, saved_count=success, matched=len(matched))
    if return_details:
        return {
            "saved_count": success,
            "matched_count": len(matched),
            "organizations": [_format_org_for_ui(o) for o in (saved_rows if saved_rows else matched)],
            "contacts": [],
            "results": [_format_org_for_ui(o) for o in (saved_rows if saved_rows else matched)],
            "saved_org_ids": saved_ids,
                "filters_applied": {
                    "location": location_filter.get("raw") or None,
                    "radius_miles": radius_n,
                    "limit": limit_n,
                    "min_score": min_score,
                    "min_score_normalized": min_score_10,
                    "discovery_mode": discovery_mode_n,
                    "max_runtime_seconds": max_runtime,
                    "excluded_record_keys_count": len(excluded_keys),
                    "source_plan": source_plan,
                },
                "dry_run": False,
                "contacts_extracted": contacts_ran,
                "source_breakdown": {"matched": matched_source_counts, "saved": saved_source_counts},
            }
    return success


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Discover potential donor organizations and save to Supabase.")
    parser.add_argument("--location", help="City and state (e.g. 'Portland OR') or ZIP code")
    parser.add_argument("--radius-miles", type=float, default=None, help="Distance from location in miles")
    parser.add_argument("--limit", "--results", dest="limit", type=int, default=100, help="Hard cap on matching records to save (max 1000)")
    parser.add_argument("--min-score", default=1, help="Minimum score threshold (supports 1-10 or 0-100 values, e.g. 80)")
    parser.add_argument("--extract-contacts", action="store_true", help="Run contact extraction for discovered organizations")
    parser.add_argument("--dry-run", action="store_true", help="Do not write to DB; only log matching results")
    return parser


if __name__ == "__main__":
    args = _build_arg_parser().parse_args()
    run_discovery(
        location=args.location,
        radius_miles=args.radius_miles,
        limit=args.limit,
        min_score=args.min_score,
        extract_contacts=args.extract_contacts,
        dry_run=args.dry_run,
    )
