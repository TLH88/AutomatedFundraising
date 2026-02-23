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
    if not supabase_configured():
        return None
    try:
        return get_client()
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
    return (q.execute().data or [])


def _insert(table, payload):
    client = _client()
    if not client:
        return {"id": f"mock-{table}-{int(_now().timestamp())}", "mock": True, **payload}
    result = client.table(table).insert(payload).execute()
    return (result.data or [{}])[0]


MOCK = {
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
    return {"team": _fetch("team_members", order_by="updated_at", desc=True, limit=limit), "total": len(_fetch("team_members", select="id", limit=5000))}


def invite_team_member(payload):
    return _insert("team_members", {
        "full_name": payload.get("full_name") or payload.get("name") or "New Team Member",
        "email": payload.get("email"),
        "role": payload.get("role", "viewer"),
        "status": payload.get("status", "invited"),
        "title": payload.get("title"),
        "invited_at": _now().isoformat(),
    })


def get_recent_updates():
    if not _client():
        return {"updates": [{"id": 1, "title": "Max finds forever home!", "category": "Success Story", "time": "2 hours ago", "icon": "story"}, {"id": 2, "title": "Adoption Event This Weekend", "category": "Event", "time": "5 hours ago", "icon": "event"}, {"id": 3, "title": "Goal Reached: 100 Rescues!", "category": "Milestone", "time": "1 day ago", "icon": "milestone"}]}
    stories = _fetch("success_stories", select="id,title,published_at", filters=[{"col": "status", "val": "published"}], order_by="published_at", desc=True, limit=3)
    events = _fetch("events", select="id,name,starts_at", order_by="starts_at", desc=False, limit=3)
    updates = [{"id": s["id"], "title": s["title"], "category": "Success Story", "time": "recent", "icon": "story"} for s in stories]
    updates.extend({"id": e["id"], "title": e["name"], "category": "Event", "time": "upcoming", "icon": "event"} for e in events)
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
