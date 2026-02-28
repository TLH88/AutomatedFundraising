"""
Supabase-backed data access for the expanded CRM dashboard.
Falls back to mock data when Supabase env vars are unavailable.
"""

from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timezone, timedelta
import time
from uuid import uuid4

try:
    from db.client import get_client  # script-style imports
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from .client import get_client

_CRM_SCHEMA_CHECKED = False
_CRM_SCHEMA_AVAILABLE = False
_DONOR_AVATAR_SUPPORTED: bool | None = None
_DONOR_FULL_NAME_SUPPORTED: bool | None = None
_SHORT_CACHE: dict[str, tuple[float, dict]] = {}
_SHORT_CACHE_TTL_SECONDS = 30


class PersistenceError(Exception):
    def __init__(self, message: str, *, code: str | None = None, details: str | None = None, hint: str | None = None):
        super().__init__(message)
        self.code = code
        self.details = details
        self.hint = hint


def _cache_get(key: str):
    item = _SHORT_CACHE.get(key)
    if not item:
        return None
    expires_at, payload = item
    if time.time() >= expires_at:
        _SHORT_CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: dict):
    _SHORT_CACHE[key] = (time.time() + _SHORT_CACHE_TTL_SECONDS, payload)
    return payload


def _cache_clear():
    _SHORT_CACHE.clear()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def uuid4_short() -> str:
    return uuid4().hex[:10]


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _normalize_age_group(value):
    text = str(value or "").strip().lower()
    if not text:
        return None
    allowed = {"baby", "young", "adult", "senior"}
    if text in allowed:
        return text
    # Heuristic mapping from free-text age input.
    if "kitten" in text or "puppy" in text or "month" in text:
        return "baby"
    if "young" in text:
        return "young"
    if "adult" in text:
        return "adult"
    if "senior" in text:
        return "senior"
    try:
        age_num = int(float(text.split()[0]))
        if age_num <= 1:
            return "baby"
        if age_num <= 3:
            return "young"
        if age_num <= 7:
            return "adult"
        return "senior"
    except Exception:
        return None


def _normalize_sex(value):
    text = str(value or "").strip().lower()
    if text in {"male", "female", "unknown"}:
        return text
    return "unknown"


def supabase_configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_PUBLISHABLE_KEY"))


def _write_fallback_allowed() -> bool:
    # In local/no-db mode, mock fallback remains useful.
    # When Supabase is configured, default is strict DB confirmation.
    raw = str(os.environ.get("ALLOW_WRITE_MOCK_FALLBACK", "false")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _error_text(exc) -> tuple[str, str | None, str | None, str | None]:
    msg = str(getattr(exc, "message", None) or str(exc) or "Database operation failed").strip()
    code = getattr(exc, "code", None)
    details = getattr(exc, "details", None) or getattr(exc, "detail", None)
    hint = getattr(exc, "hint", None)
    return msg, (str(code) if code else None), (str(details) if details else None), (str(hint) if hint else None)


def _client():
    global _CRM_SCHEMA_CHECKED, _CRM_SCHEMA_AVAILABLE
    if not supabase_configured():
        return None
    try:
        client = get_client()
        if not _CRM_SCHEMA_CHECKED:
            try:
                client.table("campaigns").select("id").limit(1).execute()
                _CRM_SCHEMA_AVAILABLE = True
            except Exception:
                _CRM_SCHEMA_AVAILABLE = False
            _CRM_SCHEMA_CHECKED = True
        # Return initialized client when configured; table-specific queries
        # still handle exceptions and can degrade gracefully per endpoint.
        return client
    except Exception:
        return None


def _donor_avatar_supported() -> bool:
    _refresh_donor_optional_support()
    global _DONOR_AVATAR_SUPPORTED
    if _DONOR_AVATAR_SUPPORTED is not None:
        return _DONOR_AVATAR_SUPPORTED
    _DONOR_AVATAR_SUPPORTED = False
    return _DONOR_AVATAR_SUPPORTED


def _donor_full_name_supported() -> bool:
    _refresh_donor_optional_support()
    global _DONOR_FULL_NAME_SUPPORTED
    if _DONOR_FULL_NAME_SUPPORTED is not None:
        return _DONOR_FULL_NAME_SUPPORTED
    _DONOR_FULL_NAME_SUPPORTED = False
    return _DONOR_FULL_NAME_SUPPORTED


def _refresh_donor_optional_support() -> None:
    global _DONOR_AVATAR_SUPPORTED, _DONOR_FULL_NAME_SUPPORTED
    if _DONOR_AVATAR_SUPPORTED is not None and _DONOR_FULL_NAME_SUPPORTED is not None:
        return
    client = _client()
    if not client:
        _DONOR_AVATAR_SUPPORTED = True
        _DONOR_FULL_NAME_SUPPORTED = True
        return
    try:
        sample_rows = client.table("donors").select("*").limit(1).execute().data or []
        if sample_rows:
            sample = sample_rows[0] or {}
            sample_keys = {str(k) for k in sample.keys()}
            _DONOR_AVATAR_SUPPORTED = "avatar_url" in sample_keys
            _DONOR_FULL_NAME_SUPPORTED = "full_name" in sample_keys
            return
    except Exception:
        pass
    # Fallback: a single capability probe avoids repeated noisy per-column 400 checks.
    try:
        client.table("donors").select("avatar_url,full_name").limit(1).execute()
        _DONOR_AVATAR_SUPPORTED = True
        _DONOR_FULL_NAME_SUPPORTED = True
    except Exception:
        _DONOR_AVATAR_SUPPORTED = False
        _DONOR_FULL_NAME_SUPPORTED = False


def data_source():
    return "supabase" if _client() else "mock"


def get_explorer_schema_status():
    required_columns = [
        "address", "city", "state", "postal_code",
        "latitude", "longitude", "email", "phone", "website",
    ]
    if not supabase_configured():
        return {
            "import_ready": False,
            "preview_ready": True,
            "data_source": data_source(),
            "required_table": "organizations",
            "required_columns": required_columns,
            "missing_columns": required_columns,
            "message": "Supabase is not configured. Preview search can run, but import is unavailable.",
            "migration": "fundraising_app/db/migrations/2026-02-24_organizations_contact_fields.sql",
        }

    try:
        client = get_client()
    except Exception:
        return {
            "import_ready": False,
            "preview_ready": True,
            "data_source": data_source(),
            "required_table": "organizations",
            "required_columns": required_columns,
            "missing_columns": required_columns,
            "message": "Unable to connect to Supabase to validate organizations schema.",
            "migration": "fundraising_app/db/migrations/2026-02-24_organizations_contact_fields.sql",
        }

    missing: list[str] = []
    for col in required_columns:
        try:
            client.table("organizations").select(col).limit(1).execute()
        except Exception:
            missing.append(col)

    import_ready = len(missing) == 0
    msg = (
        "Organizations schema is ready for import."
        if import_ready
        else f"Organizations table is missing required columns: {', '.join(missing)}."
    )
    return {
        "import_ready": import_ready,
        "preview_ready": True,
        "data_source": data_source(),
        "required_table": "organizations",
        "required_columns": required_columns,
        "missing_columns": missing,
        "message": msg,
        "migration": "fundraising_app/db/migrations/2026-02-24_organizations_contact_fields.sql",
    }


def _fetch(table, select="*", filters=None, order_by=None, desc=False, limit=None):
    client = _client()
    if not client:
        return []
    q = client.table(table).select(select)
    for f in filters or []:
        op = f.get("op", "eq")
        col = f["col"]
        val = f.get("val")
        if op == "eq":
            q = q.eq(col, val)
        elif op == "in":
            q = q.in_(col, val)
        elif op == "gte":
            q = q.gte(col, val)
    if order_by:
        q = q.order(order_by, desc=desc)
    if limit:
        q = q.limit(limit)
    try:
        return (q.execute().data or [])
    except Exception:
        return []


def _insert(table, payload, *, strict=False):
    _cache_clear()
    client = _client()
    enforce_strict = bool(strict or (supabase_configured() and not _write_fallback_allowed()))
    if not client:
        if enforce_strict:
            raise PersistenceError(
                f"Unable to write to {table}: database client unavailable.",
                code="db_client_unavailable",
                hint="Confirm SUPABASE_URL/key are configured and backend can reach Supabase.",
            )
        return {"id": f"mock-{table}-{int(_now().timestamp())}", "mock": True, **payload}
    try:
        result = client.table(table).insert(payload).execute()
        return (result.data or [{}])[0]
    except Exception as exc:
        if enforce_strict:
            msg, code, details, hint = _error_text(exc)
            raise PersistenceError(
                f"Insert failed for {table}: {msg}",
                code=code or "db_insert_failed",
                details=details,
                hint=hint,
            ) from exc
        return {"id": f"mock-{table}-{int(_now().timestamp())}", "mock": True, **payload}


def _update(table, row_id, payload):
    _cache_clear()
    client = _client()
    enforce_strict = bool(supabase_configured() and not _write_fallback_allowed())
    if not client:
        if enforce_strict:
            raise PersistenceError(
                f"Unable to update {table}: database client unavailable.",
                code="db_client_unavailable",
                hint="Confirm SUPABASE_URL/key are configured and backend can reach Supabase.",
            )
        return {"id": row_id, "mock": True, **payload}
    try:
        result = client.table(table).update(payload).eq("id", row_id).execute()
        return (result.data or [{"id": row_id, **payload}])[0]
    except Exception as exc:
        if enforce_strict:
            msg, code, details, hint = _error_text(exc)
            raise PersistenceError(
                f"Update failed for {table}: {msg}",
                code=code or "db_update_failed",
                details=details,
                hint=hint,
            ) from exc
        return {"id": row_id, "mock": True, **payload}


def _delete(table, row_id):
    _cache_clear()
    client = _client()
    enforce_strict = bool(supabase_configured() and not _write_fallback_allowed())
    if not client:
        if enforce_strict:
            raise PersistenceError(
                f"Unable to delete from {table}: database client unavailable.",
                code="db_client_unavailable",
                hint="Confirm SUPABASE_URL/key are configured and backend can reach Supabase.",
            )
        return True
    try:
        client.table(table).delete().eq("id", row_id).execute()
        return True
    except Exception as exc:
        if enforce_strict:
            msg, code, details, hint = _error_text(exc)
            raise PersistenceError(
                f"Delete failed for {table}: {msg}",
                code=code or "db_delete_failed",
                details=details,
                hint=hint,
            ) from exc
        return False


MOCK = {
    "organizations": [
        {
            "id": "org1", "name": "PetSmart Charities", "website": "https://www.petsmartcharities.org",
            "category": "pet_industry", "donation_potential_score": 95,
            "address": "19601 N 27th Ave, Phoenix, AZ 85027", "city": "Phoenix", "state": "AZ",
            "email": "info@petsmartcharities.org", "phone": "(800) 738-1385",
            "notes": "National grant-making leader for animal welfare."
        }
    ],
    "org_contacts": [
        {"id": "c-org-1", "org_id": "org1", "full_name": "Partnerships Team", "title": "Corporate Giving", "email": "giving@petsmartcharities.org", "phone": "(800) 738-1385", "confidence": "high", "do_not_contact": False, "justification": "Public giving contact"},
    ],
    "donors": [
        {"id": "1", "name": "Sarah Miller", "email": "sarah.miller@email.com", "phone": "(555) 123-4567", "tier": "hero", "status": "active", "total_donated": 12500, "first_donation_date": "2024-02-23", "last_donation_date": "2026-02-23", "donation_type": "monthly", "engagement_score": 95, "notes": "Long-time supporter", "tags": ["Monthly", "2 year anniversary"], "avatar_url": None},
    ],
    "campaigns": [
        {"id": "c1", "name": "Medical Fund", "category": "dogs", "status": "active", "description": "Emergency care for rescues", "goal": 50000, "raised": 38500, "donors": 142, "start_date": "2026-01-01", "end_date": "2026-03-31"},
    ],
    "donations": [
        {"id": "d1", "donor": "Sarah Miller", "amount": 1200.0, "campaign": "Medical Fund", "category": "dogs", "date": "2026-02-22T11:15:00+00:00", "type": "One-time", "recurring": False, "major_gift": True},
    ],
    "animals": [
        {"id": "a1", "name": "Max", "species": "dog", "status": "adopted", "breed": "Labrador Mix", "age_group": "adult"},
    ],
    "events": [
        {"id": "e1", "name": "Adoption Day", "event_type": "adoption", "status": "published", "starts_at": "2026-02-24T18:00:00+00:00", "location_name": "Downtown Park", "rsvp_count": 124, "funds_raised": 0},
    ],
    "stories": [
        {"id": "s1", "title": "Max finds forever home!", "status": "published", "views_count": 842, "likes_count": 117, "published_at": "2026-02-22T19:00:00+00:00"},
    ],
    "communications": [
        {"id": "m1", "name": "February Thank You Email", "channel": "email", "status": "sent", "open_rate": 46.2, "click_rate": 12.7, "attributed_revenue": 5400},
    ],
    "reports": [
        {"id": "r1", "title": "January Impact Report", "report_type": "monthly", "status": "published", "period_start": "2026-01-01", "period_end": "2026-01-31"},
    ],
    "team": [
        {"id": "t1", "full_name": "Tony H", "email": "tony@example.org", "role": "administrator", "status": "active"},
    ],
    "donor_notes": defaultdict(list),
    "animal_notes": defaultdict(list),
}


def _map_org_potential(raw_score):
    try:
        score = int(raw_score)
    except Exception:
        score = 0
    # Outreach table historically stores 1-10; UI expects 0-100 style.
    return score * 10 if score <= 10 else score


def _normalize_org(row):
    if not row:
        return None
    return {
        "id": row.get("id"),
        "name": row.get("name") or "Unknown Organization",
        "website": row.get("website"),
        "category": row.get("category") or "other",
        "donation_potential_score": _map_org_potential(row.get("donation_potential_score")),
        "address": row.get("address"),
        "city": row.get("city"),
        "state": row.get("state"),
        "postal_code": row.get("postal_code"),
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
        "email": row.get("email"),
        "phone": row.get("phone"),
        "notes": row.get("notes"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _normalize_org_contact(row):
    if not row:
        return None
    return {
        "id": row.get("id"),
        "org_id": row.get("org_id"),
        "full_name": row.get("full_name"),
        "title": row.get("title"),
        "email": row.get("email"),
        "phone": row.get("phone"),
        "confidence": row.get("confidence"),
        "do_not_contact": bool(row.get("do_not_contact")),
        "justification": row.get("justification"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def get_fundraising_trends(range_days: int | None = None, start_date: str | None = None, end_date: str | None = None):
    if not _client():
        return {"labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], "values": [12000, 18500, 22000, 19500, 25000, 24350], "goal": [23000] * 6, "donations": [45, 67, 82, 71, 95, 89]}
    rows = _fetch("donations", select="amount,donation_date,payment_status", filters=[{"col": "payment_status", "val": "completed"}], order_by="donation_date", limit=2000)
    if not rows:
        return {"labels": [], "values": [], "goal": [], "donations": []}
    explicit_start = _parse_dt(start_date)
    explicit_end = _parse_dt(end_date)
    if explicit_start and not explicit_end:
        explicit_end = _now()
    if explicit_end and not explicit_start:
        explicit_start = explicit_end
    if explicit_start and explicit_end and explicit_end < explicit_start:
        explicit_start, explicit_end = explicit_end, explicit_start
    if (not explicit_start or not explicit_end) and range_days:
        days = max(1, int(range_days))
        explicit_end = _now()
        explicit_start = explicit_end.replace(hour=0, minute=0, second=0, microsecond=0)
        explicit_start = explicit_start - timedelta(days=days - 1)

    bucket_mode = "monthly"
    if explicit_start and explicit_end:
        day_span = max(1, int((explicit_end - explicit_start).total_seconds() // 86400) + 1)
        bucket_mode = "daily" if day_span <= 45 else "weekly"

    buckets = defaultdict(lambda: {"amount": 0.0, "count": 0, "stamp": None})
    for r in rows:
        dt = _parse_dt(r.get("donation_date"))
        if not dt:
            continue
        if explicit_start and dt < explicit_start:
            continue
        if explicit_end and dt > explicit_end:
            continue
        if bucket_mode == "daily":
            key = dt.strftime("%Y-%m-%d")
            stamp = dt.strftime("%Y-%m-%d")
        elif bucket_mode == "weekly":
            iso_year, iso_week, _ = dt.isocalendar()
            key = f"{iso_year}-W{iso_week:02d}"
            stamp = f"{iso_year}-W{iso_week:02d}"
        else:
            key = dt.strftime("%Y-%m")
            stamp = dt.strftime("%Y-%m")
        buckets[key]["amount"] += float(r.get("amount") or 0)
        buckets[key]["count"] += 1
        buckets[key]["stamp"] = stamp
    if explicit_start and explicit_end:
        keys = sorted(buckets.keys())
    else:
        keys = sorted(buckets.keys())[-6:]
    values = [round(buckets[k]["amount"], 2) for k in keys]
    if bucket_mode == "daily":
        labels = [datetime.strptime(k, "%Y-%m-%d").strftime("%b %d") for k in keys]
    elif bucket_mode == "weekly":
        labels = [f"Week {k.split('-W')[-1]}" for k in keys]
    else:
        labels = [datetime.strptime(k + "-01", "%Y-%m-%d").strftime("%b") for k in keys]
    return {
        "labels": labels,
        "values": values,
        "goal": [round(sum(values) / len(values), 2)] * len(values) if values else [],
        "donations": [buckets[k]["count"] for k in keys],
    }


def get_explorer_organizations(location=None, radius_miles=None, limit=50, min_score=0):
    limit = max(1, min(int(limit or 100), 1000))
    min_score = int(min_score or 0)
    location = (location or "").strip()

    if not _client():
        orgs = [_normalize_org(o) for o in MOCK.get("organizations", [])]
        rows = [o for o in orgs if o]
    else:
        rows = [_normalize_org(o) for o in _fetch("organizations", select="*", order_by="donation_potential_score", desc=True, limit=1000)]
        rows = [o for o in rows if o]

    if min_score > 0:
        rows = [o for o in rows if int(o.get("donation_potential_score") or 0) >= min_score]

    # Best-effort location matching (city/address text). Radius is accepted but only
    # truly meaningful if org coordinates are available and geocoding is added later.
    if location:
        needle = location.lower()
        rows = [
            o for o in rows
            if needle in str(o.get("city") or "").lower()
            or needle in str(o.get("state") or "").lower()
            or needle in str(o.get("address") or "").lower()
        ]

    rows = rows[:limit]
    return {
        "organizations": rows,
        "total": len(rows),
        "filters_applied": {
            "location": location or None,
            "radius_miles": int(radius_miles) if str(radius_miles or "").isdigit() else None,
            "limit": limit,
            "min_score": min_score,
        },
    }


def get_explorer_organization_detail(org_id, include_contacts=True):
    if not _client():
        org_rows = [o for o in MOCK.get("organizations", []) if str(o.get("id")) == str(org_id)]
        if not org_rows:
            return None
        org = _normalize_org(org_rows[0])
        contacts = [_normalize_org_contact(c) for c in MOCK.get("org_contacts", []) if str(c.get("org_id")) == str(org_id)]
        org["contacts"] = [c for c in contacts if c] if include_contacts else []
        org["contact_count"] = len(org["contacts"])
        return org

    org_rows = _fetch("organizations", select="*", filters=[{"col": "id", "val": org_id}], limit=1)
    if not org_rows:
        return None
    org = _normalize_org(org_rows[0])
    contacts = []
    if include_contacts:
        contacts = [_normalize_org_contact(c) for c in _fetch("contacts", select="*", filters=[{"col": "org_id", "val": org_id}], limit=500)]
        contacts = [c for c in contacts if c]
    org["contacts"] = contacts
    org["contact_count"] = len(contacts)
    return org


def get_contacts(limit=500):
    limit = max(1, min(int(limit or 500), 2000))
    if not _client():
        contacts = [_normalize_org_contact(c) for c in MOCK.get("org_contacts", [])]
        contacts = [c for c in contacts if c]
        org_map = {str(o.get("id")): _normalize_org(o) for o in MOCK.get("organizations", [])}
    else:
        contacts = [_normalize_org_contact(c) for c in _fetch("contacts", select="*", order_by="updated_at", desc=True, limit=limit)]
        contacts = [c for c in contacts if c]
        org_ids = [c.get("org_id") for c in contacts if c.get("org_id")]
        org_rows = _fetch("organizations", select="*", filters=([{"col": "id", "op": "in", "val": org_ids}] if org_ids else None), limit=5000)
        org_map = {str(o.get("id")): _normalize_org(o) for o in org_rows if o}

    out = []
    for c in contacts[:limit]:
        org = org_map.get(str(c.get("org_id")))
        role_category = "General Contact"
        title = str(c.get("title") or "").lower()
        if any(k in title for k in ["owner", "founder", "principal"]):
            role_category = "Business Owner"
        elif any(k in title for k in ["giving", "philanthropy", "development", "grant", "foundation"]):
            role_category = "Giving Manager"
        elif any(k in title for k in ["community", "outreach", "partner", "marketing"]):
            role_category = "Community / Outreach Lead"
        elif any(k in title for k in ["ceo", "president", "executive", "director"]):
            role_category = "Executive Leader"

        out.append({
            **c,
            "record_type": "contact",
            "category": role_category,
            "organization_name": (org or {}).get("name"),
            "organization_category": (org or {}).get("category"),
            "organization_city": (org or {}).get("city"),
            "organization_state": (org or {}).get("state"),
            "donation_potential_score": (org or {}).get("donation_potential_score"),
        })

    return {"contacts": out, "total": len(out)}


def get_fundraising_total():
    cached = _cache_get("fundraising_total")
    if cached:
        return cached
    if not _client():
        return _cache_set("fundraising_total", {"total": 127450, "monthly": 24350, "animals_helped": 342, "change_percentage": 23})
    totals = _fetch("v_fundraising_totals")
    animals = _fetch("v_animals_impact")
    t = totals[0] if totals else {}
    a = animals[0] if animals else {}
    return _cache_set("fundraising_total", {
        "total": float(t.get("total_raised") or 0),
        "monthly": float(t.get("month_raised") or 0),
        "animals_helped": int(a.get("adopted_total") or 0),
        "change_percentage": 0,
    })


def get_recent_donations(limit=10):
    if not _client():
        return {"donations": MOCK["donations"][:limit]}
    rows = _fetch("donations", select="id,amount,donation_date,donation_type,is_major_gift,donors(display_name),campaigns(name,category)", order_by="donation_date", desc=True, limit=limit)
    out = []
    for r in rows:
        donor = r.get("donors") or {}
        camp = r.get("campaigns") or {}
        dtype = (r.get("donation_type") or "one-time").lower()
        out.append({
            "id": r.get("id"),
            "donor": donor.get("display_name", "Anonymous"),
            "amount": float(r.get("amount") or 0),
            "campaign": camp.get("name", "General Fund"),
            "category": camp.get("category", "general"),
            "date": r.get("donation_date"),
            "type": dtype.title(),
            "recurring": dtype in {"monthly", "quarterly", "annual"},
            "major_gift": bool(r.get("is_major_gift")),
        })
    return {"donations": out}


def create_donation(payload):
    client = _client()
    amount = float(payload.get("amount") or 0)
    if amount <= 0:
        amount = 1.0

    donation_type = str(payload.get("donation_type") or payload.get("type") or "one-time").lower()
    source = str(payload.get("source") or "manual").lower()
    payment_status = str(payload.get("payment_status") or "completed").lower()
    donor_id = payload.get("donor_id")
    campaign_id = payload.get("campaign_id")
    donation_date = payload.get("donation_date") or _now().isoformat()

    if not client:
        return {
            "id": f"mock-donation-{int(_now().timestamp())}",
            "donor": payload.get("donor_name") or "Anonymous",
            "amount": amount,
            "campaign": payload.get("campaign_name") or "General Fund",
            "category": payload.get("category") or "general",
            "date": donation_date,
            "type": donation_type.title(),
            "recurring": donation_type in {"monthly", "quarterly", "annual"},
            "major_gift": amount >= 1000,
            "mock": True,
        }

    inserted = _insert("donations", {
        "donor_id": donor_id,
        "campaign_id": campaign_id,
        "amount": amount,
        "donation_date": donation_date,
        "donation_type": donation_type,
        "source": source,
        "payment_status": payment_status,
        "receipt_sent": bool(payload.get("receipt_sent", False)),
        "is_major_gift": bool(payload.get("is_major_gift", amount >= 1000)),
        "notes": payload.get("notes"),
    })

    # Best-effort aggregate updates for dashboard convenience.
    try:
        if donor_id:
            donor_rows = _fetch("donors", select="id,total_donated", filters=[{"col": "id", "val": donor_id}], limit=1)
            if donor_rows:
                current_total = float(donor_rows[0].get("total_donated") or 0)
                donor_update = {
                    "total_donated": round(current_total + amount, 2),
                    "last_donation_date": str(donation_date)[:10],
                }
                if current_total <= 0:
                    donor_update["first_donation_date"] = str(donation_date)[:10]
                client.table("donors").update(donor_update).eq("id", donor_id).execute()
        if campaign_id:
            camp_rows = _fetch("campaigns", select="id,raised_amount", filters=[{"col": "id", "val": campaign_id}], limit=1)
            if camp_rows:
                current_raised = float(camp_rows[0].get("raised_amount") or 0)
                client.table("campaigns").update({
                    "raised_amount": round(current_raised + amount, 2),
                }).eq("id", campaign_id).execute()
    except Exception:
        pass

    donor_name = payload.get("donor_name") or "Anonymous"
    campaign_name = payload.get("campaign_name") or "General Fund"
    category = payload.get("category") or "general"
    if donor_id:
        d = _fetch("donors", select="id,display_name", filters=[{"col": "id", "val": donor_id}], limit=1)
        if d:
            donor_name = d[0].get("display_name") or donor_name
    if campaign_id:
        c = _fetch("campaigns", select="id,name,category", filters=[{"col": "id", "val": campaign_id}], limit=1)
        if c:
            campaign_name = c[0].get("name") or campaign_name
            category = c[0].get("category") or category

    return {
        "id": inserted.get("id"),
        "donor": donor_name,
        "amount": amount,
        "campaign": campaign_name,
        "category": category,
        "date": inserted.get("donation_date") or donation_date,
        "type": donation_type.title(),
        "recurring": donation_type in {"monthly", "quarterly", "annual"},
        "major_gift": bool(inserted.get("is_major_gift", amount >= 1000)),
    }


def get_campaigns(limit=50):
    if not _client():
        return {"campaigns": MOCK["campaigns"][:limit], "total": len(MOCK["campaigns"])}
    rows = _fetch("campaigns", select="*", order_by="updated_at", desc=True, limit=limit)
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "name": r.get("name"),
            "category": r.get("category"),
            "status": r.get("status"),
            "description": r.get("description"),
            "goal": float(r.get("goal_amount") or 0),
            "raised": float(r.get("raised_amount") or 0),
            "start_date": r.get("start_date"),
            "end_date": r.get("end_date"),
        })
    return {"campaigns": out, "total": len(_fetch("campaigns", select="id", limit=1000))}


def get_active_campaigns():
    data = get_campaigns(limit=200)["campaigns"]
    active = [c for c in data if str(c.get("status", "")).lower() == "active"]
    return {"campaigns": active, "total": len(data)}


def create_campaign(payload):
    return _insert("campaigns", {
        "name": payload.get("name") or payload.get("title") or "Untitled Campaign",
        "category": payload.get("category") or "general",
        "status": payload.get("status") or "draft",
        "description": payload.get("description"),
        "goal_amount": float(payload.get("goal") or payload.get("goal_amount") or 0),
        "start_date": payload.get("start_date"),
        "end_date": payload.get("end_date"),
    })


def get_campaign_detail(campaign_id):
    if not campaign_id:
        return None
    if not _client():
        for c in MOCK["campaigns"]:
            if str(c.get("id")) == str(campaign_id):
                return c
        return None
    rows = _fetch("campaigns", select="*", filters=[{"col": "id", "val": campaign_id}], limit=1)
    if not rows:
        return None
    r = rows[0]
    return {
        "id": r["id"],
        "name": r.get("name"),
        "category": r.get("category"),
        "status": r.get("status"),
        "description": r.get("description"),
        "goal": float(r.get("goal_amount") or 0),
        "raised": float(r.get("raised_amount") or 0),
        "start_date": r.get("start_date"),
        "end_date": r.get("end_date"),
        "image_url": r.get("image_url"),
    }


def update_campaign(campaign_id, payload):
    if not campaign_id:
        return None
    update_payload = {
        "name": payload.get("name") or payload.get("title"),
        "category": payload.get("category"),
        "status": payload.get("status"),
        "description": payload.get("description"),
        "goal_amount": float(payload.get("goal") or payload.get("goal_amount") or 0) if (payload.get("goal") is not None or payload.get("goal_amount") is not None) else None,
        "raised_amount": float(payload.get("raised") or payload.get("raised_amount") or 0) if (payload.get("raised") is not None or payload.get("raised_amount") is not None) else None,
        "start_date": payload.get("start_date"),
        "end_date": payload.get("end_date"),
        "image_url": payload.get("image_url"),
    }
    update_payload = {k: v for k, v in update_payload.items() if v is not None}
    if not update_payload:
        return get_campaign_detail(campaign_id)

    if not _client():
        for idx, c in enumerate(MOCK["campaigns"]):
            if str(c.get("id")) == str(campaign_id):
                merged = {**c, **{
                    "name": update_payload.get("name", c.get("name")),
                    "category": update_payload.get("category", c.get("category")),
                    "status": update_payload.get("status", c.get("status")),
                    "description": update_payload.get("description", c.get("description")),
                    "goal": float(update_payload.get("goal_amount", c.get("goal") or 0)),
                    "raised": float(update_payload.get("raised_amount", c.get("raised") or 0)),
                    "start_date": update_payload.get("start_date", c.get("start_date")),
                    "end_date": update_payload.get("end_date", c.get("end_date")),
                    "image_url": update_payload.get("image_url", c.get("image_url")),
                }}
                MOCK["campaigns"][idx] = merged
                return merged
        return None

    _update("campaigns", campaign_id, update_payload)
    return get_campaign_detail(campaign_id)


def delete_campaign(campaign_id):
    if not campaign_id:
        return False
    if not _client():
        before = len(MOCK["campaigns"])
        MOCK["campaigns"] = [c for c in MOCK["campaigns"] if str(c.get("id")) != str(campaign_id)]
        return len(MOCK["campaigns"]) < before
    return _delete("campaigns", campaign_id)


def get_donors(limit=50, donor_id=None):
    client = _client()
    if not client:
        if supabase_configured():
            # Avoid showing stale mock donors when backend is configured but unavailable.
            return {"donors": [], "total": 0}
        rows = MOCK["donors"]
        if donor_id is not None:
            rows = [d for d in rows if str(d["id"]) == str(donor_id)]
        return {"donors": rows[:limit], "total": len(MOCK["donors"])}
    donor_select = "id,display_name,email,phone,donor_tier,donor_status,total_donated,first_donation_date,last_donation_date,donation_type_preference,engagement_score,notes"
    if _donor_avatar_supported():
        donor_select = f"{donor_select},avatar_url"
    if _donor_full_name_supported():
        donor_select = f"{donor_select},full_name"
    rows = _fetch("donors", select=donor_select, order_by="updated_at", desc=True, limit=(1 if donor_id else limit), filters=([{"col": "id", "val": donor_id}] if donor_id else None))
    ids = [r["id"] for r in rows]
    tag_rows = _fetch("donor_tag_assignments", select="donor_id,donor_tags(name)", filters=([{"col": "donor_id", "op": "in", "val": ids}] if ids else None), limit=2000)
    tags = defaultdict(list)
    for r in tag_rows:
        tag = r.get("donor_tags") or {}
        if r.get("donor_id") and tag.get("name"):
            tags[r["donor_id"]].append(tag["name"])
    hist_rows = _fetch("donations", select="donor_id,amount,donation_date,campaigns(name)", filters=([{"col": "donor_id", "op": "in", "val": ids}] if ids else None), order_by="donation_date", desc=True, limit=2000)
    history = defaultdict(list)
    for r in hist_rows:
        did = r.get("donor_id")
        if did:
            history[did].append({"date": (r.get("donation_date") or "")[:10], "amount": float(r.get("amount") or 0), "campaign": (r.get("campaigns") or {}).get("name", "General Fund")})
    donors = []
    for r in rows:
        donors.append({
            "id": r["id"],
            "name": r.get("full_name") or r.get("display_name") or "Unknown",
            "full_name": r.get("full_name") or r.get("display_name") or "Unknown",
            "email": r.get("email"),
            "phone": r.get("phone"),
            "avatar_url": r.get("avatar_url"),
            "tier": r.get("donor_tier", "friend"),
            "status": r.get("donor_status", "active"),
            "total_donated": float(r.get("total_donated") or 0),
            "first_donation_date": r.get("first_donation_date"),
            "last_donation_date": r.get("last_donation_date"),
            "donation_type": r.get("donation_type_preference"),
            "engagement_score": int(r.get("engagement_score") or 0),
            "notes": r.get("notes"),
            "tags": tags.get(r["id"], []),
            "donation_history": history.get(r["id"], []),
            "donation_count": len(history.get(r["id"], [])),
        })
    return {"donors": donors, "total": len(_fetch("donors", select="id", limit=1000))}


def get_donor_stats():
    donors = get_donors(limit=2000)["donors"]
    recurring = [d for d in donors if str(d.get("donation_type") or "").lower() in {"monthly", "quarterly", "annual"}]
    major = [d for d in donors if str(d.get("tier") or "").lower() in {"hero", "champion"}]
    avg = int(round(sum(float(d.get("total_donated") or 0) for d in donors) / len(donors))) if donors else 0
    return {"total_donors": len(donors), "recurring_donors": len(recurring), "major_donors": len(major), "average_donation": avg, "monthly_change": {"total": 0, "recurring": 0, "major": 0, "avg_donation_percent": 0}}


def get_donor_detail(donor_id):
    rows = get_donors(limit=1, donor_id=donor_id)["donors"]
    if not rows:
        return None
    donor = rows[0]
    donor["notes_history"] = get_donor_notes(donor_id).get("notes", [])
    return donor


def update_donor(donor_id, payload):
    if not donor_id:
        return None
    if not _client():
        for idx, donor in enumerate(MOCK["donors"]):
            if str(donor.get("id")) == str(donor_id):
                updated = {
                    **donor,
                    "name": payload.get("name", donor.get("name")),
                    "email": payload.get("email", donor.get("email")),
                    "phone": payload.get("phone", donor.get("phone")),
                    "tier": payload.get("tier", donor.get("tier")),
                    "status": payload.get("status", donor.get("status")),
                    "donation_type": payload.get("donation_type", donor.get("donation_type")),
                    "engagement_score": int(payload.get("engagement_score", donor.get("engagement_score") or 0) or 0),
                    "avatar_url": payload.get("avatar_url", donor.get("avatar_url")),
                    "notes": payload.get("notes", donor.get("notes")),
                    "total_donated": float(payload.get("total_donated", donor.get("total_donated") or 0) or 0),
                }
                MOCK["donors"][idx] = updated
                updated["notes_history"] = get_donor_notes(donor_id).get("notes", [])
                return updated
        return None
    current = _fetch("donors", filters=[{"col": "id", "val": donor_id}], limit=1)
    if not current:
        return None
    row = current[0]
    update_payload = {}
    if "name" in payload or "full_name" in payload:
        full = str(payload.get("name") or payload.get("full_name") or "").strip()
        if full:
            parts = full.split()
            update_payload["first_name"] = parts[0]
            update_payload["last_name"] = " ".join(parts[1:]) if len(parts) > 1 else None
            if _donor_full_name_supported():
                update_payload["full_name"] = full
    if "email" in payload:
        update_payload["email"] = payload.get("email")
    if "phone" in payload:
        update_payload["phone"] = payload.get("phone")
    if "tier" in payload or "donor_tier" in payload:
        update_payload["donor_tier"] = payload.get("tier") or payload.get("donor_tier")
    if "status" in payload:
        update_payload["donor_status"] = payload.get("status")
    if "donation_type" in payload:
        update_payload["donation_type_preference"] = payload.get("donation_type")
    if "engagement_score" in payload:
        update_payload["engagement_score"] = int(payload.get("engagement_score") or 0)
    if "avatar_url" in payload and _donor_avatar_supported():
        update_payload["avatar_url"] = payload.get("avatar_url")
    if "notes" in payload:
        update_payload["notes"] = payload.get("notes")
    if "total_donated" in payload:
        update_payload["total_donated"] = float(payload.get("total_donated") or 0)
    if update_payload:
        _update("donors", donor_id, update_payload)
    return get_donor_detail(donor_id)


def get_donor_notes(donor_id):
    if not donor_id:
        return {"notes": []}
    if not _client():
        return {"notes": list(MOCK["donor_notes"].get(str(donor_id), []))}
    # No dedicated notes table in current schema; persist latest summary in donors.notes and keep a synthetic history entry.
    rows = _fetch("donors", filters=[{"col": "id", "val": donor_id}], limit=1)
    donor = rows[0] if rows else None
    notes = []
    if donor and donor.get("notes"):
        notes.append({
            "id": f"donor-note-{donor_id}-summary",
            "donor_id": donor_id,
            "author": "System",
            "content": donor.get("notes"),
            "created_at": donor.get("updated_at") or donor.get("last_donation_date") or _now().isoformat(),
            "synthetic": True,
        })
    return {"notes": notes}


def create_donor_note(donor_id, payload):
    content = str(payload.get("content") or "").strip()
    if not content:
        return None
    note = {
        "id": f"donor-note-{uuid4_short()}",
        "donor_id": str(donor_id),
        "author": payload.get("author") or "Team Member",
        "content": content,
        "created_at": _now().isoformat(),
        "synthetic": not bool(_client()),
    }
    if not _client():
        MOCK["donor_notes"][str(donor_id)].insert(0, note)
        # also maintain donor summary notes field
        for idx, donor in enumerate(MOCK["donors"]):
            if str(donor.get("id")) == str(donor_id):
                MOCK["donors"][idx] = {**donor, "notes": content}
                break
        return note
    _update("donors", donor_id, {"notes": content})
    return note


def create_donor(payload):
    full_name = (payload.get("full_name") or payload.get("name") or "").strip()
    if not full_name:
        first_name = "New"
        last_name = "Donor"
    else:
        parts = full_name.split()
        first_name = parts[0]
        last_name = " ".join(parts[1:]) if len(parts) > 1 else None

    initial_amount = float(payload.get("initial_donation") or payload.get("total_donated") or 0)
    today = _now().date().isoformat()
    donor_payload = {
        "first_name": first_name,
        "last_name": last_name,
        "email": payload.get("email"),
        "phone": payload.get("phone"),
        "donor_tier": payload.get("tier") or payload.get("donor_tier") or "friend",
        "donor_status": payload.get("status") or "active",
        "donation_type_preference": payload.get("donation_type"),
        "engagement_score": int(payload.get("engagement_score") or 50),
        "total_donated": initial_amount,
        "first_donation_date": (today if initial_amount > 0 else None),
        "last_donation_date": (today if initial_amount > 0 else None),
        "notes": payload.get("notes"),
    }
    if _donor_full_name_supported():
        donor_payload["full_name"] = full_name or f"{first_name} {last_name or ''}".strip()
    if _donor_avatar_supported():
        donor_payload["avatar_url"] = payload.get("avatar_url")
    created = _insert("donors", donor_payload, strict=True)

    # Normalize response shape for frontend regardless of data source.
    donor_name = created.get("full_name") or created.get("display_name") or " ".join(
        p for p in [created.get("first_name"), created.get("last_name")] if p
    ).strip() or full_name or "New Donor"
    return {
        "id": created.get("id"),
        "name": donor_name,
        "email": created.get("email"),
        "phone": created.get("phone"),
        "avatar_url": created.get("avatar_url"),
        "tier": created.get("donor_tier") or payload.get("tier") or "friend",
        "status": created.get("donor_status") or "active",
        "total_donated": float(created.get("total_donated") or initial_amount or 0),
        "first_donation_date": created.get("first_donation_date"),
        "last_donation_date": created.get("last_donation_date"),
        "donation_type": created.get("donation_type_preference"),
        "engagement_score": int(created.get("engagement_score") or 50),
        "notes": created.get("notes"),
        "tags": payload.get("tags") or [],
        "mock": bool(created.get("mock")),
    }


def get_animals(limit=50):
    if not _client():
        return {"animals": MOCK["animals"][:limit], "total": len(MOCK["animals"])}
    return {"animals": _fetch("animals", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("animals", select="id", limit=1000))}


def get_animal_detail(animal_id):
    if not _client():
        rows = [a for a in MOCK["animals"] if str(a.get("id")) == str(animal_id)]
        if not rows:
            return None
        animal = {**rows[0]}
        animal["notes_history"] = get_animal_notes(animal_id).get("notes", [])
        return animal
    rows = _fetch("animals", filters=[{"col": "id", "val": animal_id}], limit=1)
    if not rows:
        return None
    animal = rows[0]
    animal["notes_history"] = get_animal_notes(animal_id).get("notes", [])
    return animal


def create_animal(payload):
    age_group = _normalize_age_group(payload.get("age_group") or payload.get("age"))
    data = {
        "name": payload.get("name", "Unnamed"),
        "species": payload.get("species", "dog"),
        "breed": payload.get("breed"),
        "age_group": age_group,
        "sex": _normalize_sex(payload.get("sex") or payload.get("gender")),
        "status": payload.get("status", "in_care"),
        "rescue_date": payload.get("rescue_date"),
        "photo_url": payload.get("photo_url"),
        "notes": payload.get("notes"),
    }
    client = _client()
    if not client:
        return _insert("animals", data)
    try:
        result = client.table("animals").insert(data).execute()
        return (result.data or [{}])[0]
    except Exception as exc:
        # Older schemas may still use image_url instead of photo_url.
        if "photo_url" in str(exc).lower():
            fallback = {k: v for k, v in data.items() if k != "photo_url"}
            fallback["image_url"] = data.get("photo_url")
            result = client.table("animals").insert(fallback).execute()
            return (result.data or [{}])[0]
        raise


def update_animal(animal_id, payload):
    if not animal_id:
        return None
    if not _client():
        for idx, animal in enumerate(MOCK["animals"]):
            if str(animal.get("id")) == str(animal_id):
                updated = {
                    **animal,
                    "name": payload.get("name", animal.get("name")),
                    "species": payload.get("species", animal.get("species")),
                    "breed": payload.get("breed", animal.get("breed")),
                    "age_group": _normalize_age_group(payload.get("age_group") or payload.get("age")) or animal.get("age_group"),
                    "sex": _normalize_sex(payload.get("sex") or payload.get("gender") or animal.get("sex")),
                    "status": payload.get("status", animal.get("status")),
                    "photo_url": payload.get("photo_url", animal.get("photo_url")),
                    "notes": payload.get("notes", animal.get("notes")),
                }
                MOCK["animals"][idx] = updated
                return updated
        return None
    current = _fetch("animals", filters=[{"col": "id", "val": animal_id}], limit=1)
    if not current:
        return None
    update_payload = {}
    for field in ["name", "species", "breed", "status", "photo_url", "notes", "rescue_date"]:
        if field in payload:
            update_payload[field] = payload.get(field)
    if "age_group" in payload or "age" in payload:
        normalized_age_group = _normalize_age_group(payload.get("age_group") or payload.get("age"))
        if normalized_age_group:
            update_payload["age_group"] = normalized_age_group
    if "sex" in payload or "gender" in payload:
        update_payload["sex"] = _normalize_sex(payload.get("sex") or payload.get("gender"))
    if update_payload:
        client = _client()
        if not client:
            _update("animals", animal_id, update_payload)
        else:
            try:
                client.table("animals").update(update_payload).eq("id", animal_id).execute()
            except Exception as exc:
                if "photo_url" in str(exc).lower():
                    fallback = {k: v for k, v in update_payload.items() if k != "photo_url"}
                    fallback["image_url"] = update_payload.get("photo_url")
                    client.table("animals").update(fallback).eq("id", animal_id).execute()
                else:
                    raise
    return get_animal_detail(animal_id)


def delete_animal(animal_id):
    if not animal_id:
        return False
    if not _client():
        before = len(MOCK["animals"])
        MOCK["animals"] = [a for a in MOCK["animals"] if str(a.get("id")) != str(animal_id)]
        return len(MOCK["animals"]) < before
    return _delete("animals", animal_id)


def get_animal_notes(animal_id):
    if not animal_id:
        return {"notes": []}
    if not _client():
        return {"notes": list(MOCK["animal_notes"].get(str(animal_id), []))}
    rows = _fetch("animals", filters=[{"col": "id", "val": animal_id}], limit=1)
    animal = rows[0] if rows else None
    notes = []
    if animal and animal.get("notes"):
        notes.append({
            "id": f"animal-note-{animal_id}-summary",
            "animal_id": animal_id,
            "author": "System",
            "content": animal.get("notes"),
            "created_at": animal.get("updated_at") or _now().isoformat(),
            "synthetic": True,
        })
    return {"notes": notes}


def create_animal_note(animal_id, payload):
    content = str(payload.get("content") or "").strip()
    if not content:
        return None
    note = {
        "id": f"animal-note-{uuid4_short()}",
        "animal_id": str(animal_id),
        "author": payload.get("author") or "Team Member",
        "content": content,
        "created_at": _now().isoformat(),
        "synthetic": not bool(_client()),
    }
    if not _client():
        MOCK["animal_notes"][str(animal_id)].insert(0, note)
        for idx, animal in enumerate(MOCK["animals"]):
            if str(animal.get("id")) == str(animal_id):
                MOCK["animals"][idx] = {**animal, "notes": content}
                break
        return note
    _update("animals", animal_id, {"notes": content})
    return note


def get_events(limit=50):
    if not _client():
        return {"events": MOCK["events"][:limit], "total": len(MOCK["events"])}
    return {"events": _fetch("events", order_by="starts_at", desc=False, limit=limit), "total": len(_fetch("events", select="id", limit=1000))}


def create_event(payload):
    return _insert("events", {
        "name": payload.get("name", "Untitled Event"),
        "event_type": payload.get("event_type") or payload.get("type") or "fundraiser",
        "status": payload.get("status") or "planned",
        "description": payload.get("description"),
        "starts_at": payload.get("starts_at") or payload.get("date") or _now().isoformat(),
        "ends_at": payload.get("ends_at"),
        "location_name": payload.get("location_name") or payload.get("location"),
        "location_address": payload.get("location_address"),
    })


def get_stories(limit=50):
    if not _client():
        return {"stories": MOCK["stories"][:limit], "total": len(MOCK["stories"])}
    return {"stories": _fetch("success_stories", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("success_stories", select="id", limit=1000))}


def get_story(story_id):
    if not _client():
        rows = [s for s in MOCK["stories"] if str(s.get("id")) == str(story_id)]
        return rows[0] if rows else None
    rows = _fetch("success_stories", filters=[{"col": "id", "val": story_id}], limit=1)
    return rows[0] if rows else None


def create_story(payload):
    return _insert("success_stories", {
        "title": payload.get("title", "Untitled Story"),
        "status": payload.get("status", "draft"),
        "excerpt": payload.get("excerpt"),
        "body": payload.get("body"),
        "cover_image_url": payload.get("cover_image_url"),
    })


def update_story(story_id, payload):
    if not _client():
        for idx, story in enumerate(MOCK["stories"]):
            if str(story.get("id")) == str(story_id):
                updated = {
                    **story,
                    "title": payload.get("title", story.get("title")),
                    "status": payload.get("status", story.get("status", "draft")),
                    "excerpt": payload.get("excerpt", story.get("excerpt") or story.get("summary")),
                    "body": payload.get("body", story.get("body") or story.get("content")),
                    "cover_image_url": payload.get("cover_image_url", story.get("cover_image_url")),
                }
                MOCK["stories"][idx] = updated
                return updated
        return None
    existing = _fetch("success_stories", filters=[{"col": "id", "val": story_id}], limit=1)
    if not existing:
        return None
    current = existing[0]
    update_payload = {}
    for field in ["title", "status", "excerpt", "body", "cover_image_url"]:
        if field in payload:
            update_payload[field] = payload.get(field)
    if not update_payload:
        return current
    updated = _update("success_stories", story_id, update_payload)
    return {**current, **updated}


def get_communications(limit=50):
    if not _client():
        return {"campaigns": MOCK["communications"][:limit], "total": len(MOCK["communications"])}
    return {"campaigns": _fetch("communication_campaigns", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("communication_campaigns", select="id", limit=1000))}


def get_communication_campaign(campaign_id):
    if not _client():
        rows = [c for c in MOCK["communications"] if str(c.get("id")) == str(campaign_id)]
        return rows[0] if rows else None
    rows = _fetch("communication_campaigns", filters=[{"col": "id", "val": campaign_id}], limit=1)
    return rows[0] if rows else None


def create_communication_campaign(payload):
    return _insert("communication_campaigns", {
        "name": payload.get("name", "Untitled Communication"),
        "channel": payload.get("channel", "email"),
        "status": payload.get("status", "draft"),
        "audience_segment": payload.get("audience_segment"),
        "scheduled_for": payload.get("scheduled_for"),
        "notes": payload.get("notes"),
    })


def update_communication_campaign(campaign_id, payload):
    if not _client():
        for idx, campaign in enumerate(MOCK["communications"]):
            if str(campaign.get("id")) == str(campaign_id):
                updated = {
                    **campaign,
                    "name": payload.get("name", campaign.get("name")),
                    "channel": payload.get("channel", campaign.get("channel", "email")),
                    "status": payload.get("status", campaign.get("status", "draft")),
                    "audience_segment": payload.get("audience_segment", campaign.get("audience_segment")),
                    "scheduled_for": payload.get("scheduled_for", campaign.get("scheduled_for")),
                    "notes": payload.get("notes", campaign.get("notes")),
                }
                MOCK["communications"][idx] = updated
                return updated
        return None
    existing = _fetch("communication_campaigns", filters=[{"col": "id", "val": campaign_id}], limit=1)
    if not existing:
        return None
    current = existing[0]
    update_payload = {}
    for field in ["name", "channel", "status", "audience_segment", "scheduled_for", "notes"]:
        if field in payload:
            update_payload[field] = payload.get(field)
    if "metadata" in payload:
        update_payload["metadata"] = payload.get("metadata")
    if not update_payload:
        return current
    updated = _update("communication_campaigns", campaign_id, update_payload)
    return {**current, **updated}


def get_reports(limit=50):
    if not _client():
        return {"reports": MOCK["reports"][:limit], "total": len(MOCK["reports"])}
    return {"reports": _fetch("impact_reports", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("impact_reports", select="id", limit=1000))}


def get_report(report_id):
    if not _client():
        rows = [r for r in MOCK["reports"] if str(r.get("id")) == str(report_id)]
        return rows[0] if rows else None
    rows = _fetch("impact_reports", filters=[{"col": "id", "val": report_id}], limit=1)
    return rows[0] if rows else None


def create_report(payload):
    return _insert("impact_reports", {
        "title": payload.get("title", "Untitled Report"),
        "report_type": payload.get("report_type") or payload.get("type") or "custom",
        "status": payload.get("status", "draft"),
        "period_start": payload.get("period_start"),
        "period_end": payload.get("period_end"),
        "summary": payload.get("summary"),
        "data_snapshot": payload.get("data_snapshot") or {},
    })


def update_report(report_id, payload):
    if not _client():
        for idx, report in enumerate(MOCK["reports"]):
            if str(report.get("id")) == str(report_id):
                updated = {
                    **report,
                    "title": payload.get("title", report.get("title")),
                    "report_type": payload.get("report_type", payload.get("type", report.get("report_type", "custom"))),
                    "status": payload.get("status", report.get("status", "draft")),
                    "period_start": payload.get("period_start", report.get("period_start")),
                    "period_end": payload.get("period_end", report.get("period_end")),
                    "summary": payload.get("summary", report.get("summary")),
                    "data_snapshot": payload.get("data_snapshot", report.get("data_snapshot") or {}),
                }
                MOCK["reports"][idx] = updated
                return updated
        return None
    existing = _fetch("impact_reports", filters=[{"col": "id", "val": report_id}], limit=1)
    if not existing:
        return None
    current = existing[0]
    update_payload = {}
    for field in ["title", "status", "period_start", "period_end", "summary", "data_snapshot"]:
        if field in payload:
            update_payload[field] = payload.get(field)
    if "report_type" in payload or "type" in payload:
        update_payload["report_type"] = payload.get("report_type") or payload.get("type")
    if not update_payload:
        return current
    updated = _update("impact_reports", report_id, update_payload)
    return {**current, **updated}


def get_team(limit=50):
    if not _client():
        return {"team": MOCK["team"][:limit], "total": len(MOCK["team"])}
    rows = _fetch("team_members", order_by="updated_at", desc=True, limit=limit)
    out = []
    for r in rows:
        out.append(_normalize_team_member(r))
    return {"team": out, "total": len(_fetch("team_members", select="id", limit=1000))}


def get_team_member(member_id):
    if not _client():
        rows = [m for m in MOCK["team"] if str(m.get("id")) == str(member_id)]
        return rows[0] if rows else None
    rows = _fetch("team_members", filters=[{"col": "id", "val": member_id}], limit=1)
    return _normalize_team_member(rows[0]) if rows else None


def invite_team_member(payload):
    created = _insert("team_members", {
        "full_name": payload.get("full_name") or payload.get("name") or "New Team Member",
        "email": payload.get("email"),
        "role": _map_team_role(payload.get("role", "viewer")),
        "status": payload.get("status", "invited"),
        "title": payload.get("title"),
        "avatar_url": payload.get("avatar_url"),
        "invited_at": _now().isoformat(),
        "joined_at": payload.get("joined_at"),
    })
    return _normalize_team_member(created)


def create_team_member(payload):
    created = _insert("team_members", {
        "full_name": payload.get("full_name") or payload.get("name") or "New Team Member",
        "email": payload.get("email"),
        "role": _map_team_role(payload.get("role", "viewer")),
        "status": payload.get("status") or "active",
        "title": payload.get("title"),
        "avatar_url": payload.get("avatar_url"),
        "joined_at": payload.get("joined_at") or _now().isoformat(),
        "last_active_at": payload.get("last_active_at"),
    })
    return _normalize_team_member(created)


def update_team_member(member_id, payload):
    if not _client():
        for idx, member in enumerate(MOCK["team"]):
            if str(member.get("id")) == str(member_id):
                updated = {
                    **member,
                    "full_name": payload.get("full_name", member.get("full_name") or member.get("name")),
                    "email": payload.get("email", member.get("email")),
                    "role": payload.get("role", member.get("role")),
                    "status": payload.get("status", member.get("status")),
                    "title": payload.get("title", member.get("title")),
                    "avatar_url": payload.get("avatar_url", member.get("avatar_url")),
                }
                MOCK["team"][idx] = updated
                return _normalize_team_member(updated)
        return None

    existing = _fetch("team_members", filters=[{"col": "id", "val": member_id}], limit=1)
    if not existing:
        return None
    current = existing[0]
    update_payload = {}
    if "full_name" in payload or "name" in payload:
        update_payload["full_name"] = payload.get("full_name") or payload.get("name") or current.get("full_name")
    for field in ["email", "status", "title", "avatar_url", "last_active_at", "joined_at"]:
        if field in payload:
            update_payload[field] = payload.get(field)
    if "role" in payload:
        update_payload["role"] = _map_team_role(payload.get("role"))
    if not update_payload:
        return _normalize_team_member(current)
    updated = _update("team_members", member_id, update_payload)
    merged = {**current, **updated}
    return _normalize_team_member(merged)


def delete_team_member(member_id):
    if not _client():
        for idx, member in enumerate(MOCK["team"]):
            if str(member.get("id")) == str(member_id):
                updated = {**member, "status": "inactive"}
                MOCK["team"][idx] = updated
                return True
        return False
    _update("team_members", member_id, {"status": "inactive"})
    verify = _fetch("team_members", select="id,status", filters=[{"col": "id", "val": member_id}], limit=1)
    return bool(verify and str((verify[0] or {}).get("status") or "").lower() == "inactive")


def _map_team_role(role):
    val = str(role or "viewer").lower().strip()
    if val in {"member", "editor"}:
        return "editor"
    if val in {"administrator", "admin"}:
        return "administrator"
    return "viewer"


def _normalize_team_member(row):
    if not row:
        return row
    full_name = row.get("full_name") or row.get("name") or "Team Member"
    role = str(row.get("role") or "viewer").lower()
    role_label = "Administrator" if role == "administrator" else ("Member" if role == "editor" else "Visitor")
    return {
        "id": row.get("id"),
        "full_name": full_name,
        "name": full_name,
        "email": row.get("email"),
        "role": role,
        "role_label": role_label,
        "status": row.get("status") or "active",
        "title": row.get("title"),
        "avatar_url": row.get("avatar_url"),
        "last_active_at": row.get("last_active_at"),
        "joined_at": row.get("joined_at"),
        "invited_at": row.get("invited_at"),
    }


def get_recent_updates():
    if not _client():
        return {"updates": [
            {"id": "story-1", "title": "Max finds forever home!", "category": "Success Story", "time": "2 hours ago", "icon": "story", "page": "stories.html", "record_type": "story", "summary": "Success story published for Max's adoption."},
            {"id": "event-1", "title": "Adoption Event This Weekend", "category": "Event", "time": "5 hours ago", "icon": "event", "page": "events.html", "record_type": "event", "summary": "Upcoming adoption event was published and is collecting RSVPs."},
            {"id": "milestone-1", "title": "Goal Reached: 100 Rescues!", "category": "Milestone", "time": "1 day ago", "icon": "milestone", "page": "analytics.html", "record_type": "milestone", "summary": "Rescue milestone reached and highlighted for dashboard visibility."},
        ]}
    stories = _fetch("success_stories", select="id,title,published_at", filters=[{"col": "status", "val": "published"}], order_by="published_at", desc=True, limit=3)
    events = _fetch("events", select="id,name,starts_at", order_by="starts_at", desc=False, limit=3)
    updates = [{
        "id": s["id"],
        "title": s["title"],
        "category": "Success Story",
        "time": "recent",
        "icon": "story",
        "page": "stories.html",
        "record_type": "story",
        "record_id": s["id"],
        "summary": "Published success story update.",
    } for s in stories]
    updates.extend({
        "id": e["id"],
        "title": e["name"],
        "category": "Event",
        "time": "upcoming",
        "icon": "event",
        "page": "events.html",
        "record_type": "event",
        "record_id": e["id"],
        "summary": "Upcoming event update.",
    } for e in events)
    return {"updates": updates[:6]}


def get_monthly_impact():
    total = get_fundraising_total()
    donations = get_recent_donations(limit=500)["donations"]
    now = _now()
    count = 0
    for d in donations:
        dt = _parse_dt(d.get("date"))
        if dt and dt.year == now.year and dt.month == now.month:
            count += 1
    return {"amount": total["monthly"], "animals_helped": total["animals_helped"], "change_percentage": total["change_percentage"], "donations_count": count}


def get_stats_overview():
    cached = _cache_get("stats_overview")
    if cached:
        return cached
    campaigns = get_active_campaigns()["campaigns"]
    donors = get_donors(limit=500)["donors"]
    events = get_events(limit=50)["events"]
    recurring = sum(1 for d in donors if str(d.get("donation_type") or "").lower() in {"monthly", "quarterly", "annual"})
    next_event = None
    now = _now()
    for e in events:
        dt = _parse_dt(e.get("starts_at"))
        if dt and dt >= now and (next_event is None or dt < _parse_dt(next_event.get("starts_at"))):
            next_event = e
    return _cache_set("stats_overview", {
        "active_campaigns": len(campaigns),
        "donor_retention": int(round((recurring / len(donors)) * 100)) if donors else 0,
        "upcoming_events": sum(1 for e in events if (_parse_dt(e.get("starts_at")) or now) >= now),
        "next_event": {"name": next_event.get("name"), "date": str(next_event.get("starts_at", ""))[:10], "rsvps": next_event.get("rsvp_count", 0)} if next_event else None,
    })


def get_automation_runs(limit=50):
    if not _client():
        return {"runs": [], "total": 0}
    return {"runs": _fetch("automation_runs", order_by="created_at", desc=True, limit=limit), "total": len(_fetch("automation_runs", select="id", limit=1000))}


def create_automation_run(payload):
    return _insert("automation_runs", {
        "run_type": payload.get("run_type", "custom"),
        "status": payload.get("status", "queued"),
        "triggered_by": payload.get("triggered_by"),
        "external_run_id": payload.get("external_run_id"),
        "started_at": payload.get("started_at"),
        "completed_at": payload.get("completed_at"),
        "progress_percent": int(payload.get("progress_percent", 0)),
        "summary": payload.get("summary"),
        "metadata": payload.get("metadata") or {},
    })
