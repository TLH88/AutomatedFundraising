"""
emailer/batch_send.py
SendGrid-powered batch email sender.

- Pulls pending contacts from Supabase for a given campaign
- Renders personalized subject + body per contact
- Sends via SendGrid API (transactional, with open tracking)
- Writes send status back to Supabase after each send
- Handles unsubscribe keywords in replies (via webhook — see sync_tracking)

Usage:
    python -m emailer.batch_send --campaign-id <UUID> [--limit 50]
"""

import os
import sys
import time
import logging
import argparse

import sendgrid
from sendgrid.helpers.mail import Mail, Email, To, Content, TrackingSettings, ClickTracking, OpenTracking

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db.client import (
    get_contactable_leads, get_active_campaign,
    create_email_send, update_send_status, get_recently_contacted_org_ids
)
from emailer.render_template import render_email, SENDER_NAME, SENDER_EMAIL

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ── Config ───────────────────────────────────────────────────
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "50"))
SEND_DELAY_SECONDS = float(os.environ.get("SEND_DELAY_SECONDS", "1.5"))  # rate limiting
ORG_SEND_GAP_HOURS = int(os.environ.get("ORG_SEND_GAP_HOURS", "24"))


def send_one(sg_client, subject: str, body: str,
             to_email: str, send_id: str) -> tuple[bool, str]:
    """
    Send a single email via SendGrid.
    Returns (success: bool, error_message: str).
    """
    try:
        message = Mail(
            from_email=Email(SENDER_EMAIL, SENDER_NAME),
            to_emails=To(to_email),
            subject=subject,
            plain_text_content=Content("text/plain", body)
        )

        # Enable tracking
        tracking = TrackingSettings()
        tracking.open_tracking = OpenTracking(enable=True)
        tracking.click_tracking = ClickTracking(enable=True, enable_text=True)
        message.tracking_settings = tracking

        # Tag with send_id for webhook correlation
        message.custom_arg = {"send_id": send_id}

        response = sg_client.send(message)

        if response.status_code in (200, 202):
            return True, ""
        else:
            return False, f"HTTP {response.status_code}: {response.body}"

    except Exception as e:
        return False, str(e)


def run_batch(campaign_id: str, limit: int = BATCH_SIZE) -> dict:
    """
    Main batch sending function.
    Returns a summary dict: {sent, failed, skipped}.
    """
    if not SENDGRID_API_KEY:
        raise RuntimeError("SENDGRID_API_KEY is not set. Cannot send emails.")

    campaign = get_active_campaign(campaign_id)
    if not campaign:
        raise ValueError(
            f"Campaign '{campaign_id}' not found or not in 'active' status. "
            "Set the campaign status to 'active' in Supabase before sending."
        )

    logger.info(f"Campaign: '{campaign['name']}' | Batch limit: {limit}")

    leads = get_contactable_leads(campaign_id, limit=limit)
    logger.info(f"Found {len(leads)} contactable leads for this batch.")

    if not leads:
        logger.info("No leads to send to. All caught up!")
        return {"sent": 0, "failed": 0, "skipped": 0}

    sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)

    results = {"sent": 0, "failed": 0, "skipped": 0}
    recently_contacted_orgs = get_recently_contacted_org_ids(hours_back=ORG_SEND_GAP_HOURS)

    for lead in leads:
        contact = lead
        org = lead.get("organizations") or {}
        org_id = contact.get("org_id") or org.get("id")

        if org_id and org_id in recently_contacted_orgs:
            logger.info(
                f"  Skipping '{contact.get('full_name', 'Unknown')}' — "
                f"org contacted within last {ORG_SEND_GAP_HOURS}h."
            )
            results["skipped"] += 1
            continue

        to_email = contact.get("email", "").strip()
        if not to_email:
            logger.warning(f"  Skipping '{contact.get('full_name')}' — no email.")
            results["skipped"] += 1
            continue

        # Create a pending send record
        send_record = create_email_send(campaign_id, contact["id"])
        send_id = send_record.get("id", "unknown")

        # Render the personalized email
        try:
            subject, body = render_email(campaign, contact, org, send_id)
        except Exception as e:
            logger.error(f"  Template render error for {to_email}: {e}")
            update_send_status(send_id, "failed", error=str(e))
            results["failed"] += 1
            continue

        logger.info(f"  Sending → {to_email} ({contact.get('full_name', 'Unknown')})")

        success, error = send_one(sg, subject, body, to_email, send_id)

        if success:
            update_send_status(send_id, "sent")
            results["sent"] += 1
            if org_id:
                recently_contacted_orgs.add(org_id)
            logger.info("    ✓ Sent")
        else:
            update_send_status(send_id, "failed", error=error)
            results["failed"] += 1
            logger.error(f"    ✗ Failed: {error}")

        # Polite delay between sends
        time.sleep(SEND_DELAY_SECONDS)

    logger.info(
        f"Batch complete — Sent: {results['sent']} | "
        f"Failed: {results['failed']} | Skipped: {results['skipped']}"
    )
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send a batch of campaign emails via SendGrid.")
    parser.add_argument("--campaign-id", required=True, help="UUID of the campaign to send")
    parser.add_argument("--limit", type=int, default=BATCH_SIZE,
                        help=f"Max emails to send in this batch (default: {BATCH_SIZE})")
    args = parser.parse_args()

    summary = run_batch(campaign_id=args.campaign_id, limit=args.limit)
    sys.exit(0 if summary["failed"] == 0 else 1)
