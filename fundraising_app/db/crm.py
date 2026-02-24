"""
Supabase-backed data access for the expanded CRM dashboard.
Falls back to mock data when Supabase env vars are unavailable.
"""

from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timezone

try:
    from db.client import get_client  # script-style imports
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from .client import get_client

_CRM_SCHEMA_CHECKED = False
_CRM_SCHEMA_AVAILABLE = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def supabase_configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_PUBLISHABLE_KEY"))


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
        return client if _CRM_SCHEMA_AVAILABLE else None
    except Exception:
        return None


def data_source():
    return "supabase" if _client() else "mock"


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


def _insert(table, payload):
    client = _client()
    if not client:
        return {"id": f"mock-{table}-{int(_now().timestamp())}", "mock": True, **payload}
    try:
        result = client.table(table).insert(payload).execute()
        return (result.data or [{}])[0]
    except Exception:
        return {"id": f"mock-{table}-{int(_now().timestamp())}", "mock": True, **payload}


def _update(table, row_id, payload):
    client = _client()
    if not client:
        return {"id": row_id, "mock": True, **payload}
    try:
        result = client.table(table).update(payload).eq("id", row_id).execute()
        return (result.data or [{"id": row_id, **payload}])[0]
    except Exception:
        return {"id": row_id, "mock": True, **payload}


def _delete(table, row_id):
    client = _client()
    if not client:
        return True
    try:
        client.table(table).delete().eq("id", row_id).execute()
        return True
    except Exception:
        return False


MOCK = {
    "organizations": [
        {
            "id": "org1", "name": "PetSmart Charities", "website": "https://www.petsmartcharities.org",
            "category": "pet_industry", "donation_potential_score": 95,
            "address": "19601 N 27th Ave, Phoenix, AZ 85027", "city": "Phoenix", "state": "AZ",
            "email": "info@petsmartcharities.org", "phone": "(800) 738-1385",
            "notes": "National grant-making leader for animal welfare."
        },
        {
            "id": "org2", "name": "Petco Love", "website": "https://petcolove.org",
            "category": "pet_industry", "donation_potential_score": 94,
            "address": "10850 Via Frontera, San Diego, CA 92127", "city": "San Diego", "state": "CA",
            "email": "hello@petcolove.org", "phone": "(858) 453-7845",
            "notes": "Petco Foundation / Petco Love grants and shelter partnerships."
        },
        {
            "id": "org3", "name": "Maddie's Fund", "website": "https://www.maddiesfund.org",
            "category": "foundation", "donation_potential_score": 98,
            "address": "P.O. Box 29901, San Francisco, CA 94129", "city": "San Francisco", "state": "CA",
            "email": "info@maddiesfund.org", "phone": "(925) 310-5450",
            "notes": "Major funder of shelter and rescue innovation."
        },
    ],
    "org_contacts": [
        {"id": "c-org-1", "org_id": "org1", "full_name": "Partnerships Team", "title": "Corporate Giving", "email": "giving@petsmartcharities.org", "phone": "(800) 738-1385", "confidence": "high", "do_not_contact": False, "justification": "Public giving contact"},
        {"id": "c-org-2", "org_id": "org2", "full_name": "Grant Programs", "title": "Grant Support", "email": "grants@petcolove.org", "phone": "(858) 453-7845", "confidence": "medium", "do_not_contact": False, "justification": "Foundation grant contact"},
        {"id": "c-org-3", "org_id": "org3", "full_name": "Programs Office", "title": "Program Officer", "email": "programs@maddiesfund.org", "phone": "(925) 310-5450", "confidence": "medium", "do_not_contact": False, "justification": "Program inquiry contact"},
    ],
    "donors": [
        {"id": "1", "name": "Sarah Miller", "email": "sarah.miller@email.com", "phone": "(555) 123-4567", "tier": "hero", "status": "active", "total_donated": 12500, "first_donation_date": "2024-02-23", "last_donation_date": "2026-02-23", "donation_type": "monthly", "engagement_score": 95, "notes": "Long-time supporter", "tags": ["Monthly", "2 year anniversary"]},
        {"id": "2", "name": "John Doe", "email": "john.doe@company.com", "phone": "(555) 222-3344", "tier": "champion", "status": "active", "total_donated": 6000, "first_donation_date": "2025-01-10", "last_donation_date": "2026-02-21", "donation_type": "monthly", "engagement_score": 82, "notes": "Corporate match eligible", "tags": ["Monthly", "Loves Dogs"]},
        {"id": "3", "name": "Anna Johnson", "email": "anna.j@email.com", "phone": "(555) 333-7788", "tier": "supporter", "status": "active", "total_donated": 1750, "first_donation_date": "2025-08-12", "last_donation_date": "2026-02-16", "donation_type": "one-time", "engagement_score": 68, "notes": "Responds to stories", "tags": ["One-time", "Cat Lover"]},
    ],
    "campaigns": [
        {"id": "c1", "name": "Medical Fund", "category": "dogs", "status": "active", "description": "Emergency care for rescues", "goal": 50000, "raised": 38500, "donors": 142, "start_date": "2026-01-01", "end_date": "2026-03-31"},
        {"id": "c2", "name": "Shelter Support", "category": "shelter", "status": "active", "description": "Operations and supplies", "goal": 30000, "raised": 27800, "donors": 98, "start_date": "2026-01-15", "end_date": "2026-04-15"},
        {"id": "c3", "name": "Kitten Foster Network", "category": "cats", "status": "draft", "description": "Expand foster capacity", "goal": 18000, "raised": 0, "donors": 0, "start_date": "2026-03-01", "end_date": "2026-06-01"},
    ],
    "donations": [
        {"id": "d1", "donor": "John Doe", "amount": 500.0, "campaign": "Medical Fund", "category": "dogs", "date": "2026-02-22T14:30:00+00:00", "type": "Monthly", "recurring": True},
        {"id": "d2", "donor": "Sarah Miller", "amount": 1200.0, "campaign": "Shelter Support", "category": "shelter", "date": "2026-02-22T11:15:00+00:00", "type": "One-time", "recurring": False, "major_gift": True},
        {"id": "d3", "donor": "Anna Johnson", "amount": 750.0, "campaign": "Medical Fund", "category": "dogs", "date": "2026-02-20T10:20:00+00:00", "type": "One-time", "recurring": False},
    ],
    "animals": [
        {"id": "a1", "name": "Max", "species": "dog", "status": "adopted", "breed": "Labrador Mix", "age_group": "adult"},
        {"id": "a2", "name": "Luna", "species": "cat", "status": "in_care", "breed": "Domestic Shorthair", "age_group": "young"},
        {"id": "a3", "name": "Buddy", "species": "dog", "status": "foster", "breed": "Terrier Mix", "age_group": "senior"},
    ],
    "events": [
        {"id": "e1", "name": "Adoption Day", "event_type": "adoption", "status": "published", "starts_at": "2026-02-24T18:00:00+00:00", "location_name": "Downtown Park", "rsvp_count": 124, "funds_raised": 0},
        {"id": "e2", "name": "Spring Gala", "event_type": "fundraiser", "status": "planned", "starts_at": "2026-03-15T02:00:00+00:00", "location_name": "Riverside Hall", "rsvp_count": 62, "funds_raised": 8500},
    ],
    "stories": [
        {"id": "s1", "title": "Max finds forever home!", "status": "published", "views_count": 842, "likes_count": 117, "published_at": "2026-02-22T19:00:00+00:00"},
        {"id": "s2", "title": "Rescue transport saves 12 puppies", "status": "draft", "views_count": 0, "likes_count": 0, "published_at": None},
    ],
    "communications": [
        {"id": "m1", "name": "February Thank You Email", "channel": "email", "status": "sent", "open_rate": 46.2, "click_rate": 12.7, "attributed_revenue": 5400},
        {"id": "m2", "name": "Spring Gala Invite", "channel": "email", "status": "scheduled", "open_rate": None, "click_rate": None, "attributed_revenue": 0},
    ],
    "reports": [
        {"id": "r1", "title": "January Impact Report", "report_type": "monthly", "status": "published", "period_start": "2026-01-01", "period_end": "2026-01-31"},
        {"id": "r2", "title": "Q1 Board Snapshot", "report_type": "quarterly", "status": "draft", "period_start": "2026-01-01", "period_end": "2026-03-31"},
    ],
    "team": [
        {"id": "t1", "full_name": "Tony H", "email": "tony@example.org", "role": "administrator", "status": "active"},
        {"id": "t2", "full_name": "Hope", "email": "hope@furryfriendswa.org", "role": "editor", "status": "invited"},
    ],
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


def get_fundraising_trends():
    if not _client():
        return {"labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], "values": [12000, 18500, 22000, 19500, 25000, 24350], "goal": [23000] * 6, "donations": [45, 67, 82, 71, 95, 89]}
    rows = _fetch("donations", select="amount,donation_date,payment_status", filters=[{"col": "payment_status", "val": "completed"}], order_by="donation_date", limit=5000)
    if not rows:
        return {"labels": [], "values": [], "goal": [], "donations": []}
    buckets = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for r in rows:
        dt = _parse_dt(r.get("donation_date"))
        if not dt:
            continue
        key = dt.strftime("%Y-%m")
        buckets[key]["amount"] += float(r.get("amount") or 0)
        buckets[key]["count"] += 1
    keys = sorted(buckets.keys())[-6:]
    values = [round(buckets[k]["amount"], 2) for k in keys]
    return {
        "labels": [datetime.strptime(k + "-01", "%Y-%m-%d").strftime("%b") for k in keys],
        "values": values,
        "goal": [round(sum(values) / len(values), 2)] * len(values) if values else [],
        "donations": [buckets[k]["count"] for k in keys],
    }


def get_explorer_organizations(location=None, radius_miles=None, limit=100, min_score=0):
    limit = max(1, min(int(limit or 100), 1000))
    min_score = int(min_score or 0)
    location = (location or "").strip()

    if not _client():
        orgs = [_normalize_org(o) for o in MOCK.get("organizations", [])]
        rows = [o for o in orgs if o]
    else:
        rows = [_normalize_org(o) for o in _fetch("organizations", select="*", order_by="donation_potential_score", desc=True, limit=2000)]
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


def get_fundraising_total():
    if not _client():
        return {"total": 127450, "monthly": 24350, "animals_helped": 342, "change_percentage": 23}
    totals = _fetch("v_fundraising_totals")
    animals = _fetch("v_animals_impact")
    t = totals[0] if totals else {}
    a = animals[0] if animals else {}
    return {
        "total": float(t.get("total_raised") or 0),
        "monthly": float(t.get("month_raised") or 0),
        "animals_helped": int(a.get("adopted_total") or 0),
        "change_percentage": 0,
    }


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


def get_campaigns(limit=100):
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
    return {"campaigns": out, "total": len(_fetch("campaigns", select="id", limit=5000))}


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


def get_donors(limit=100, donor_id=None):
    if not _client():
        rows = MOCK["donors"]
        if donor_id is not None:
            rows = [d for d in rows if str(d["id"]) == str(donor_id)]
        return {"donors": rows[:limit], "total": len(MOCK["donors"])}
    rows = _fetch("donors", select="id,display_name,email,phone,donor_tier,donor_status,total_donated,first_donation_date,last_donation_date,donation_type_preference,engagement_score,notes", order_by="updated_at", desc=True, limit=(1 if donor_id else limit), filters=([{"col": "id", "val": donor_id}] if donor_id else None))
    ids = [r["id"] for r in rows]
    tag_rows = _fetch("donor_tag_assignments", select="donor_id,donor_tags(name)", filters=([{"col": "donor_id", "op": "in", "val": ids}] if ids else None), limit=5000)
    tags = defaultdict(list)
    for r in tag_rows:
        tag = r.get("donor_tags") or {}
        if r.get("donor_id") and tag.get("name"):
            tags[r["donor_id"]].append(tag["name"])
    hist_rows = _fetch("donations", select="donor_id,amount,donation_date,campaigns(name)", filters=([{"col": "donor_id", "op": "in", "val": ids}] if ids else None), order_by="donation_date", desc=True, limit=5000)
    history = defaultdict(list)
    for r in hist_rows:
        did = r.get("donor_id")
        if did:
            history[did].append({"date": (r.get("donation_date") or "")[:10], "amount": float(r.get("amount") or 0), "campaign": (r.get("campaigns") or {}).get("name", "General Fund")})
    donors = []
    for r in rows:
        donors.append({
            "id": r["id"],
            "name": r.get("display_name") or "Unknown",
            "email": r.get("email"),
            "phone": r.get("phone"),
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
    return {"donors": donors, "total": len(_fetch("donors", select="id", limit=5000))}


def get_donor_stats():
    donors = get_donors(limit=5000)["donors"]
    recurring = [d for d in donors if str(d.get("donation_type") or "").lower() in {"monthly", "quarterly", "annual"}]
    major = [d for d in donors if str(d.get("tier") or "").lower() in {"hero", "champion"}]
    avg = int(round(sum(float(d.get("total_donated") or 0) for d in donors) / len(donors))) if donors else 0
    return {"total_donors": len(donors), "recurring_donors": len(recurring), "major_donors": len(major), "average_donation": avg, "monthly_change": {"total": 0, "recurring": 0, "major": 0, "avg_donation_percent": 0}}


def get_donor_detail(donor_id):
    rows = get_donors(limit=1, donor_id=donor_id)["donors"]
    return rows[0] if rows else None


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
    created = _insert("donors", {
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
    })

    # Normalize response shape for frontend regardless of data source.
    donor_name = created.get("display_name") or " ".join(
        p for p in [created.get("first_name"), created.get("last_name")] if p
    ).strip() or full_name or "New Donor"
    return {
        "id": created.get("id"),
        "name": donor_name,
        "email": created.get("email"),
        "phone": created.get("phone"),
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


def get_animals(limit=100):
    if not _client():
        return {"animals": MOCK["animals"][:limit], "total": len(MOCK["animals"])}
    return {"animals": _fetch("animals", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("animals", select="id", limit=5000))}


def create_animal(payload):
    return _insert("animals", {
        "name": payload.get("name", "Unnamed"),
        "species": payload.get("species", "dog"),
        "breed": payload.get("breed"),
        "age_group": payload.get("age_group") or payload.get("age"),
        "status": payload.get("status", "in_care"),
        "rescue_date": payload.get("rescue_date"),
        "photo_url": payload.get("photo_url"),
        "notes": payload.get("notes"),
    })


def get_events(limit=100):
    if not _client():
        return {"events": MOCK["events"][:limit], "total": len(MOCK["events"])}
    return {"events": _fetch("events", order_by="starts_at", desc=False, limit=limit), "total": len(_fetch("events", select="id", limit=5000))}


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


def get_stories(limit=100):
    if not _client():
        return {"stories": MOCK["stories"][:limit], "total": len(MOCK["stories"])}
    return {"stories": _fetch("success_stories", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("success_stories", select="id", limit=5000))}


def create_story(payload):
    return _insert("success_stories", {
        "title": payload.get("title", "Untitled Story"),
        "status": payload.get("status", "draft"),
        "excerpt": payload.get("excerpt"),
        "body": payload.get("body"),
        "cover_image_url": payload.get("cover_image_url"),
    })


def get_communications(limit=100):
    if not _client():
        return {"campaigns": MOCK["communications"][:limit], "total": len(MOCK["communications"])}
    return {"campaigns": _fetch("communication_campaigns", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("communication_campaigns", select="id", limit=5000))}


def create_communication_campaign(payload):
    return _insert("communication_campaigns", {
        "name": payload.get("name", "Untitled Communication"),
        "channel": payload.get("channel", "email"),
        "status": payload.get("status", "draft"),
        "audience_segment": payload.get("audience_segment"),
        "scheduled_for": payload.get("scheduled_for"),
        "notes": payload.get("notes"),
    })


def get_reports(limit=100):
    if not _client():
        return {"reports": MOCK["reports"][:limit], "total": len(MOCK["reports"])}
    return {"reports": _fetch("impact_reports", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("impact_reports", select="id", limit=5000))}


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


def get_team(limit=100):
    if not _client():
        return {"team": MOCK["team"][:limit], "total": len(MOCK["team"])}
    rows = _fetch("team_members", order_by="updated_at", desc=True, limit=limit)
    out = []
    for r in rows:
        out.append(_normalize_team_member(r))
    return {"team": out, "total": len(_fetch("team_members", select="id", limit=5000))}


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
                updated = {**member, "status": "disabled"}
                MOCK["team"][idx] = updated
                return True
        return False
    _update("team_members", member_id, {"status": "disabled"})
    verify = _fetch("team_members", select="id,status", filters=[{"col": "id", "val": member_id}], limit=1)
    if verify and str((verify[0] or {}).get("status") or "").lower() == "disabled":
      return True
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
    return {
        "active_campaigns": len(campaigns),
        "donor_retention": int(round((recurring / len(donors)) * 100)) if donors else 0,
        "upcoming_events": sum(1 for e in events if (_parse_dt(e.get("starts_at")) or now) >= now),
        "next_event": {"name": next_event.get("name"), "date": str(next_event.get("starts_at", ""))[:10], "rsvps": next_event.get("rsvp_count", 0)} if next_event else None,
    }


def get_automation_runs(limit=50):
    if not _client():
        return {"runs": [], "total": 0}
    return {"runs": _fetch("automation_runs", order_by="created_at", desc=True, limit=limit), "total": len(_fetch("automation_runs", select="id", limit=5000))}


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
