"""
db/client.py
Supabase database client wrapper for AutomatedFundraising.
All database operations go through this module.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from supabase import create_client, Client


def get_client() -> Client:
    """Return an authenticated Supabase client using the publishable key.

    Uses SUPABASE_PUBLISHABLE_KEY (sb_publishable_...) — the modern,
    recommended key format. Access is governed by RLS policies on each table.
    """
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    return create_client(url, key)


# ──────────────────────────────────────────────
# ORGANIZATIONS
# ──────────────────────────────────────────────

def upsert_organization(data: dict) -> dict:
    """
    Insert or update an organization by name + website.
    Returns the upserted row.
    """
    client = get_client()

    # Check if organization already exists
    existing = (
        client.table("organizations")
        .select("id")
        .eq("name", data.get("name"))
        .eq("website", data.get("website"))
        .execute()
    )

    if existing.data:
        # Update existing
        result = (
            client.table("organizations")
            .update(data)
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        # Insert new
        result = (
            client.table("organizations")
            .insert(data)
            .execute()
        )

    return result.data[0] if result.data else {}


def get_organizations(min_score: int = 1, limit: int = 500) -> list:
    """Return organizations above a minimum donation potential score."""
    client = get_client()
    result = (
        client.table("organizations")
        .select("*")
        .gte("donation_potential_score", min_score)
        .order("donation_potential_score", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ──────────────────────────────────────────────
# CONTACTS
# ──────────────────────────────────────────────

def upsert_contact(data: dict) -> dict:
    """
    Insert or update a contact by email.
    Returns the upserted row.
    """
    client = get_client()
    result = (
        client.table("contacts")
        .upsert(data, on_conflict="email")
        .execute()
    )
    return result.data[0] if result.data else {}


def get_contactable_leads(campaign_id: str, limit: int = 50) -> list:
    """
    Return contacts who:
    - have a valid email
    - have do_not_contact = false
    - have NOT already been sent this campaign
    """
    client = get_client()

    # Get contact IDs already sent for this campaign
    sent = (
        client.table("email_sends")
        .select("contact_id")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    already_sent_ids = [row["contact_id"] for row in (sent.data or [])]

    query = (
        client.table("contacts")
        .select("*, organizations(*)")
        .eq("do_not_contact", False)
        .not_.is_("email", "null")
    )

    if already_sent_ids:
        query = query.not_.in_("id", already_sent_ids)

    result = query.limit(limit).execute()
    return result.data or []


def get_recently_contacted_org_ids(hours_back: int = 24) -> set[str]:
    """
    Return organization IDs that have had any email send created in the last N hours.
    Used to enforce a cooldown between contacts at the same organization.
    """
    client = get_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours_back)).isoformat()
    result = (
        client.table("email_sends")
        .select("contact_id, created_at, contacts(org_id)")
        .gte("created_at", cutoff)
        .execute()
    )
    org_ids: set[str] = set()
    for row in (result.data or []):
        contact_row = row.get("contacts") or {}
        org_id = contact_row.get("org_id")
        if org_id:
            org_ids.add(org_id)
    return org_ids


def flag_do_not_contact(contact_id: str) -> None:
    """Mark a contact as do_not_contact = true (unsubscribe handling)."""
    client = get_client()
    client.table("contacts").update({"do_not_contact": True}).eq("id", contact_id).execute()


# ──────────────────────────────────────────────
# EMAIL SENDS
# ──────────────────────────────────────────────

def create_email_send(campaign_id: str, contact_id: str) -> dict:
    """Create a pending email send record."""
    client = get_client()
    result = (
        client.table("email_sends")
        .insert({
            "campaign_id": campaign_id,
            "contact_id": contact_id,
            "status": "pending"
        })
        .execute()
    )
    return result.data[0] if result.data else {}


def update_send_status(send_id: str, status: str, error: Optional[str] = None,
                        tracking_pixel_id: Optional[str] = None) -> None:
    """Update the status of an email send record."""
    import datetime
    client = get_client()
    payload = {"status": status}
    if error:
        payload["error_message"] = error
    if tracking_pixel_id:
        payload["tracking_pixel_id"] = tracking_pixel_id
    if status == "sent":
        payload["sent_at"] = datetime.datetime.utcnow().isoformat()
    client.table("email_sends").update(payload).eq("id", send_id).execute()


def get_active_campaign(campaign_id: str) -> Optional[dict]:
    """Fetch a campaign record by ID."""
    client = get_client()
    result = (
        client.table("email_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .eq("status", "active")
        .single()
        .execute()
    )
    return result.data
