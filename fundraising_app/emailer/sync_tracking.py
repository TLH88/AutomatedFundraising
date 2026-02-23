"""
emailer/sync_tracking.py
Pulls email event data from SendGrid and syncs status back to Supabase.

SendGrid events tracked:
  - open    → status: 'opened'
  - click   → status: 'opened' (minimum)
  - bounce  → status: 'bounced' + flag do_not_contact
  - unsubscribe → status: 'unsubscribed' + flag do_not_contact

Run as a scheduled GitHub Action (daily).
Can also be triggered by SendGrid event webhooks (see README for setup).
"""

import os
import sys
import logging
from datetime import datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db.client import get_client, flag_do_not_contact

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
SENDGRID_EVENTS_URL = "https://api.sendgrid.com/v3/messages"

# Map SendGrid event types → our status
EVENT_STATUS_MAP = {
    "open": "opened",
    "click": "opened",       # upgrade to opened at minimum
    "bounce": "bounced",
    "blocked": "bounced",
    "unsubscribe": "unsubscribed",
    "spamreport": "unsubscribed",
    "delivered": "sent",
}

# Events that require flagging do_not_contact
DNC_EVENTS = {"bounce", "blocked", "unsubscribe", "spamreport"}


def fetch_sendgrid_events(hours_back: int = 25) -> list[dict]:
    """
    Query SendGrid Activity API for recent email events.
    Requires SendGrid plan with Email Activity access.
    """
    if not SENDGRID_API_KEY:
        logger.error("SENDGRID_API_KEY not set.")
        return []

    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")

    headers = {
        "Authorization": f"Bearer {SENDGRID_API_KEY}",
        "Content-Type": "application/json"
    }
    params = {
        "limit": 1000,
        "last_event_time": f"between({since_str},{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')})"
    }

    try:
        resp = requests.get(SENDGRID_EVENTS_URL, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json().get("messages", [])
    except requests.RequestException as e:
        logger.error(f"SendGrid API error: {e}")
        return []


def sync_events(hours_back: int = 25) -> dict:
    """
    Main sync function.
    Returns summary: {updated, flagged_dnc, errors}
    """
    db = get_client()
    events = fetch_sendgrid_events(hours_back=hours_back)
    logger.info(f"Fetched {len(events)} events from SendGrid.")

    results = {"updated": 0, "flagged_dnc": 0, "errors": 0}

    for event in events:
        # SendGrid custom_arg send_id is stored in unique_args
        unique_args = event.get("unique_args", {})
        send_id = unique_args.get("send_id")

        if not send_id:
            continue

        event_type = event.get("event", "").lower()
        new_status = EVENT_STATUS_MAP.get(event_type)

        if not new_status:
            continue

        try:
            # Update send record
            db.table("email_sends").update({"status": new_status}).eq("id", send_id).execute()
            results["updated"] += 1

            # Flag do_not_contact for bounces/unsubscribes
            if event_type in DNC_EVENTS:
                # Get the contact_id from the send record
                send_row = db.table("email_sends").select("contact_id").eq("id", send_id).single().execute()
                if send_row.data:
                    flag_do_not_contact(send_row.data["contact_id"])
                    results["flagged_dnc"] += 1
                    logger.info(f"  Flagged DNC for send {send_id} (event: {event_type})")

        except Exception as e:
            logger.error(f"Error updating send {send_id}: {e}")
            results["errors"] += 1

    logger.info(
        f"Sync complete — Updated: {results['updated']} | "
        f"Flagged DNC: {results['flagged_dnc']} | Errors: {results['errors']}"
    )
    return results


if __name__ == "__main__":
    sync_events()
    sys.exit(0)
