"""
Optional LLM-assisted planning and justification for discovery.

This module is designed to fail open:
- If no LLM API key is configured, it returns heuristic plans/justifications.
- If an LLM request fails, the discovery pipeline continues with fallback logic.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import requests

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    load_dotenv = None

if load_dotenv:
    # Load project .env for direct script execution paths (discover.py / tests).
    _env_path = Path(__file__).resolve().parents[1] / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)


def _cfg(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _cfg_bool(name: str, default: bool = False) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return str(val).strip().lower() in {"1", "true", "yes", "on"}


def _cfg_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except Exception:
        return default


def llm_enabled() -> bool:
    return bool(_cfg("OPENAI_API_KEY", ""))


def plan_source_types(criteria: dict[str, Any]) -> dict[str, Any]:
    """Return source type targets and creative query plans for discovery."""
    fallback = _heuristic_source_plan(criteria)
    if not llm_enabled():
        return {**fallback, "planner": "heuristic"}
    try:
        prompt = {
            "task": "Plan a diverse, creative funding-source discovery strategy for a nonprofit no-kill animal organization.",
            "criteria": {
                "location": criteria.get("location"),
                "radius_miles": criteria.get("radius_miles"),
                "min_score": criteria.get("min_score"),
                "discovery_mode": criteria.get("discovery_mode"),
                "goal": "Find net-new potential donors and supporters likely to contribute to an animal welfare nonprofit.",
                "accepted_contribution_types": [
                    "cash donations",
                    "corporate sponsorships",
                    "foundation grants",
                    "gift cards",
                    "gift certificates",
                    "in-kind goods",
                    "in-kind services",
                    "event partnerships",
                ],
            },
            "output_format": {
                "source_types": ["businesses", "nonprofits", "foundations", "grants", "municipal_programs", "wealth_advisors"],
                "query_focus_terms": ["..."],
                "contribution_modes": ["cash", "gift_cards", "in_kind_goods", "in_kind_services", "sponsorships", "grants"],
                "source_buckets": [
                    {"bucket": "gift_cards_certificates", "examples": ["restaurants", "salons"], "why_relevant": "short reason"},
                    {"bucket": "in_kind_services", "examples": ["printers", "photographers"], "why_relevant": "short reason"},
                ],
                "role_targets": ["owner", "community relations manager", "csr manager", "store manager"],
                "query_families": [
                    {
                        "family": "gift_cards_certificates",
                        "contribution_mode": "gift_cards",
                        "priority": 1,
                        "queries": ["gift cards donation local business", "raffle prize donation business"],
                    }
                ],
                "notes": "short rationale",
            },
            "constraints": [
                "Prefer practical, searchable source types.",
                "Keep query terms concise and location-relevant.",
                "Include both proven funding sources and creative local partnership ideas.",
                "At least 30% of query_families should target non-cash support (gift cards, goods, or services).",
                "Focus on actionable business/org categories rather than speculative individuals.",
                "Return JSON only.",
            ],
        }
        data = _openai_json_request(prompt)
        source_types = _string_list(data.get("source_types"), 12)
        query_focus_terms = _string_list(data.get("query_focus_terms"), 24)
        contribution_modes = _string_list(data.get("contribution_modes"), 16)
        role_targets = _string_list(data.get("role_targets"), 16)
        source_buckets = _normalize_source_buckets(data.get("source_buckets"))
        query_families = _normalize_query_families(data.get("query_families"))
        if not source_types and not query_focus_terms and not query_families:
            return {**fallback, "planner": "heuristic"}
        return {
            "source_types": source_types[:12] or fallback["source_types"],
            "query_focus_terms": query_focus_terms[:24] or fallback["query_focus_terms"],
            "contribution_modes": contribution_modes or fallback.get("contribution_modes", []),
            "source_buckets": source_buckets or fallback.get("source_buckets", []),
            "role_targets": role_targets or fallback.get("role_targets", []),
            "query_families": query_families or fallback.get("query_families", []),
            "notes": str(data.get("notes") or fallback.get("notes") or ""),
            "planner": "llm",
        }
    except Exception:
        return {**fallback, "planner": "heuristic_fallback"}


def org_justification(org: dict[str, Any], criteria: dict[str, Any]) -> dict[str, str]:
    """Natural language justification + additional info for an organization candidate."""
    if llm_enabled() and _cfg_bool("DISCOVERY_LLM_JUSTIFICATIONS_ENABLED", False):
        try:
            prompt = {
                "task": "Explain why this source may be a donor prospect for an animal welfare nonprofit, based on the provided signals.",
                "criteria": criteria,
                "candidate": {
                    "name": org.get("name"),
                    "category": org.get("category"),
                    "score_10": _score_10(org.get("donation_potential_score")),
                    "score_100": _score_100(org.get("donation_potential_score")),
                    "website": org.get("website"),
                    "address": org.get("address"),
                    "city": org.get("city"),
                    "state": org.get("state"),
                    "notes": org.get("notes"),
                },
                "output_format": {
                    "justification": "one concise paragraph",
                    "additional_info": "one concise paragraph",
                },
                "constraints": [
                    "Do not fabricate facts.",
                    "Base reasoning on the provided candidate signals only.",
                    "Return JSON only.",
                ],
            }
            data = _openai_json_request(prompt)
            return {
                "justification": str(data.get("justification") or "").strip() or _heuristic_org_justification(org, criteria),
                "additional_info": str(data.get("additional_info") or "").strip(),
            }
        except Exception:
            pass
    return {
        "justification": _heuristic_org_justification(org, criteria),
        "additional_info": _heuristic_org_additional_info(org),
    }


def contact_justification(contact: dict[str, Any], org: dict[str, Any] | None = None) -> str:
    """Natural language justification for why a contact is relevant."""
    title = str(contact.get("title") or "").strip()
    role_category = str(contact.get("category") or "").strip()
    confidence = str(contact.get("confidence") or "low").strip()
    org_name = str((org or {}).get("name") or contact.get("organization_name") or "the organization").strip()
    bits = []
    if role_category:
        bits.append(f"Classified as {role_category}")
    if title:
        bits.append(f"based on title '{title}'")
    else:
        bits.append("based on available contact details")
    bits.append(f"for {org_name}")
    bits.append(f"(confidence: {confidence})")
    return " ".join(bits) + ". This contact appears relevant for donation outreach review."


def build_serpapi_queries(base_queries: list[str], plan: dict[str, Any], location_query: str | None = None) -> list[str]:
    """Blend static + planner output into a diverse, deduped SerpAPI query set."""
    queries: list[str] = []
    seen: set[str] = set()
    focuses = [str(x).strip() for x in (plan.get("query_focus_terms") or []) if str(x).strip()]
    source_types = [str(x).strip() for x in (plan.get("source_types") or []) if str(x).strip()]
    query_families = plan.get("query_families") or []
    role_targets = [str(x).strip() for x in (plan.get("role_targets") or []) if str(x).strip()]

    for q in base_queries:
        _add_query(queries, seen, q)
    for focus in focuses:
        _add_query(queries, seen, focus)
    for family in query_families:
        if not isinstance(family, dict):
            continue
        fam_queries = [str(x).strip() for x in (family.get("queries") or []) if str(x).strip()]
        for q in fam_queries[:4]:
            _add_query(queries, seen, q)
    for src in source_types:
        if src == "municipal_programs":
            _add_query(queries, seen, "municipal grant animal welfare program")
        elif src == "grants":
            _add_query(queries, seen, "foundation grant animal shelter nonprofit")
        elif src == "wealth_advisors":
            _add_query(queries, seen, "wealth advisors community giving philanthropy")
        elif src == "businesses":
            _add_query(queries, seen, "local businesses charitable giving sponsor program")
    for role in role_targets[:6]:
        if any(token in role.lower() for token in ("owner", "manager", "director", "csr", "community")):
            _add_query(queries, seen, f"{role} charitable giving local business")

    out: list[str] = []
    for q in queries[:22]:
        out.append(f"{q} {location_query}".strip() if location_query else q)
    return out


def _add_query(queries: list[str], seen: set[str], query: str):
    q = str(query or "").strip()
    if not q:
        return
    key = q.lower()
    if key in seen:
        return
    seen.add(key)
    queries.append(q)


def _heuristic_source_plan(criteria: dict[str, Any]) -> dict[str, Any]:
    mode = str(criteria.get("discovery_mode") or "businesses").lower()
    radius = float(criteria.get("radius_miles") or 0)
    source_types = ["businesses", "foundations", "nonprofits", "grants"]
    if mode == "wealth_related":
        source_types = ["wealth_advisors", "businesses", "foundations"]
    elif mode == "nonprofits":
        source_types = ["nonprofits", "foundations", "grants", "municipal_programs"]
    elif mode == "foundations":
        source_types = ["foundations", "grants", "municipal_programs"]
    elif mode == "all":
        source_types = ["businesses", "nonprofits", "foundations", "grants", "municipal_programs", "wealth_advisors"]

    focus = [
        "animal welfare corporate sponsor program",
        "charitable giving foundation grants nonprofit",
        "community outreach donations local business",
        "gift card donation fundraiser local businesses",
        "in kind donation services nonprofit animal rescue",
        "raffle prize gift certificate donation local",
    ]
    if radius <= 15:
        focus.append("local employer community giving")
    else:
        focus.append("regional corporate philanthropy program")
    source_buckets = [
        {
            "bucket": "corporate_sponsorships",
            "examples": ["banks", "real estate firms", "insurance agencies", "car dealerships"],
            "why_relevant": "Local businesses with marketing budgets may support sponsorships and event underwriting.",
        },
        {
            "bucket": "gift_cards_certificates",
            "examples": ["restaurants", "salons", "spas", "retail boutiques", "coffee shops"],
            "why_relevant": "Useful for raffles, auctions, and event incentives even when cash giving is limited.",
        },
        {
            "bucket": "in_kind_goods",
            "examples": ["pet supply stores", "hardware stores", "office supply stores", "grocery stores"],
            "why_relevant": "Can provide supplies, prizes, food, and operational support items.",
        },
        {
            "bucket": "in_kind_services",
            "examples": ["printers", "photographers", "marketing agencies", "landscapers", "cleaning services"],
            "why_relevant": "Service donations reduce operating costs and support events/campaigns.",
        },
    ]
    query_families = [
        {"family": "sponsorships", "contribution_mode": "sponsorships", "priority": 1, "queries": ["local business event sponsorship nonprofit", "community sponsor animal rescue fundraiser"]},
        {"family": "gift_cards_certificates", "contribution_mode": "gift_cards", "priority": 2, "queries": ["gift card donation raffle local business", "gift certificate donation nonprofit fundraiser"]},
        {"family": "in_kind_goods", "contribution_mode": "in_kind_goods", "priority": 2, "queries": ["in kind goods donation local business nonprofit", "product donation animal shelter local store"]},
        {"family": "in_kind_services", "contribution_mode": "in_kind_services", "priority": 3, "queries": ["donated services nonprofit fundraiser local", "pro bono services animal rescue organization"]},
        {"family": "foundations_grants", "contribution_mode": "grants", "priority": 1, "queries": ["foundation grants animal welfare nonprofit", "community foundation grant rescue shelter"]},
    ]
    return {
        "source_types": source_types,
        "query_focus_terms": focus,
        "contribution_modes": ["cash", "sponsorships", "grants", "gift_cards", "in_kind_goods", "in_kind_services"],
        "source_buckets": source_buckets,
        "role_targets": ["owner", "store manager", "community relations manager", "marketing director", "csr manager"],
        "query_families": query_families,
        "notes": "Heuristic source targeting based on discovery mode and radius.",
    }


def _string_list(value: Any, max_items: int) -> list[str]:
    out: list[str] = []
    for item in (value or []):
        s = str(item or "").strip()
        if not s:
            continue
        out.append(s)
        if len(out) >= max_items:
            break
    return out


def _normalize_source_buckets(value: Any) -> list[dict[str, Any]]:
    buckets: list[dict[str, Any]] = []
    for item in (value or []):
        if not isinstance(item, dict):
            continue
        bucket = str(item.get("bucket") or "").strip()
        if not bucket:
            continue
        examples = _string_list(item.get("examples"), 8)
        why = str(item.get("why_relevant") or "").strip()
        buckets.append({"bucket": bucket, "examples": examples, "why_relevant": why})
        if len(buckets) >= 12:
            break
    return buckets


def _normalize_query_families(value: Any) -> list[dict[str, Any]]:
    families: list[dict[str, Any]] = []
    for item in (value or []):
        if not isinstance(item, dict):
            continue
        family = str(item.get("family") or "").strip()
        queries = _string_list(item.get("queries"), 8)
        if not family or not queries:
            continue
        try:
            priority = int(item.get("priority") or 0)
        except Exception:
            priority = 0
        families.append(
            {
                "family": family,
                "contribution_mode": str(item.get("contribution_mode") or "").strip(),
                "priority": max(0, min(10, priority)),
                "queries": queries,
            }
        )
    families.sort(key=lambda x: (x.get("priority") or 99, x.get("family") or ""))
    return families[:16]


def _heuristic_org_justification(org: dict[str, Any], criteria: dict[str, Any]) -> str:
    name = str(org.get("name") or "This source").strip()
    category = str(org.get("category") or "other").replace("_", " ")
    score100 = _score_100(org.get("donation_potential_score"))
    score10 = _score_10(org.get("donation_potential_score"))
    city = str(org.get("city") or "").strip()
    state = str(org.get("state") or "").strip()
    location = ", ".join([x for x in [city, state] if x]) or "the search area"
    reasons = []
    if score10 >= 8:
        reasons.append("strong donor-likelihood score based on category and entity signals")
    elif score10 >= 5:
        reasons.append("moderate donor-likelihood score with some capacity/alignment indicators")
    else:
        reasons.append("lower donor-likelihood score but still a potential local outreach candidate")
    if "foundation" in category or "nonprofit" in category:
        reasons.append("category suggests structured giving or mission-driven funding potential")
    elif "financial" in category or "corporate" in category:
        reasons.append("category suggests possible philanthropic programs or sponsorship capacity")
    elif "pet" in category:
        reasons.append("category shows direct alignment with animal welfare mission")
    return f"{name} was scored {score100}/100 as a {category} prospect in {location} because it matches the requested search criteria and shows {', and '.join(reasons)}."


def _heuristic_org_additional_info(org: dict[str, Any]) -> str:
    bits = []
    if org.get("website"):
        bits.append("Website available for further review and contact extraction")
    if org.get("phone"):
        bits.append("Organization phone number is available")
    if org.get("address") or org.get("city"):
        bits.append("Location details were identified from source data")
    raw_notes = str(org.get("notes") or "").strip()
    if raw_notes:
        bits.append("Source metadata was captured from discovery provider")
    return ". ".join(bits[:3]) + ("." if bits else "")


def _score_10(score: Any) -> int:
    try:
        n = int(float(score or 0))
    except Exception:
        return 0
    if n > 10:
        return max(1, min(10, (n + 9) // 10))
    return max(0, min(10, n))


def _score_100(score: Any) -> int:
    n = _score_10(score)
    return n * 10 if n <= 10 else n


def _openai_json_request(payload: dict[str, Any]) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {_cfg('OPENAI_API_KEY', '')}",
        "Content-Type": "application/json",
    }
    body = {
        "model": _cfg("DISCOVERY_LLM_MODEL", "gpt-4.1-mini"),
        "messages": [
            {"role": "system", "content": "You are a fundraising prospecting assistant. Return valid JSON only."},
            {"role": "user", "content": json.dumps(payload)},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(
        f"{_cfg('OPENAI_API_BASE', 'https://api.openai.com/v1').rstrip('/')}/chat/completions",
        headers=headers,
        json=body,
        timeout=(5, _cfg_float("DISCOVERY_LLM_TIMEOUT_SECONDS", 12.0)),
    )
    resp.raise_for_status()
    data = resp.json() or {}
    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not content:
        return {}
    return json.loads(content)
