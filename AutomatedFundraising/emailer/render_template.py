"""
emailer/render_template.py
Token replacement engine for personalized email campaigns.

Supported tokens (all double-curly-brace format):
  {{contact_name}}     — First name of the contact (or "Friend" as fallback)
  {{org_name}}         — Organization name
  {{org_reason}}       — Why this org was selected (from justification field)
  {{fundraiser_name}}  — Name of the active fundraiser campaign
  {{sender_name}}      — Sender's full name
  {{sender_email}}     — Sender's email address
  {{unsubscribe_link}} — Unsubscribe URL (per contact)
"""

import re
import os

# ── Default sender identity (override via env vars) ─────────────
# Recommendation: "Hope from Furry Friends" <hope@furryfriendswa.org>
# Research shows a warm, human first name with mission alignment
# significantly outperforms generic org names for open and click rates.
SENDER_NAME = os.environ.get("SENDER_NAME", "Hope from Furry Friends")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "hope@furryfriendswa.org")
FUNDRAISER_NAME = os.environ.get("FUNDRAISER_NAME", "2026 Animal Rescue Campaign")
UNSUBSCRIBE_BASE_URL = os.environ.get(
    "UNSUBSCRIBE_BASE_URL", "https://furryfriendswa.org/unsubscribe"
)

TOKEN_PATTERN = re.compile(r"\{\{(\w+)\}\}")


def _first_name(full_name: str | None) -> str:
    """Extract first name from full name, fallback to 'Friend'."""
    if not full_name:
        return "Friend"
    parts = full_name.strip().split()
    return parts[0] if parts else "Friend"


def build_token_map(contact: dict, org: dict, send_id: str) -> dict:
    """
    Build a complete token → value mapping for a given contact + org.
    `contact` should be the contacts row (may include nested org under 'organizations').
    `org` is the organizations row.
    `send_id` is used to generate a unique unsubscribe link.
    """
    org_justification = contact.get("justification") or org.get("notes") or "your commitment to the community"

    return {
        "contact_name": _first_name(contact.get("full_name")),
        "org_name": org.get("name", "Your Organization"),
        "org_reason": org_justification,
        "fundraiser_name": FUNDRAISER_NAME,
        "sender_name": SENDER_NAME,
        "sender_email": SENDER_EMAIL,
        "unsubscribe_link": f"{UNSUBSCRIBE_BASE_URL}?id={send_id}",
    }


def render(template: str, tokens: dict) -> str:
    """
    Replace all {{token}} placeholders in a template string.
    Unknown tokens are left as-is so nothing silently disappears.
    """
    def replacer(match):
        key = match.group(1)
        return tokens.get(key, match.group(0))  # leave unknown tokens intact

    return TOKEN_PATTERN.sub(replacer, template)


def render_email(campaign: dict, contact: dict, org: dict, send_id: str) -> tuple[str, str]:
    """
    Render both the subject and body for a specific contact + campaign.

    Returns:
        (rendered_subject, rendered_body)
    """
    tokens = build_token_map(contact, org, send_id)
    subject = render(campaign.get("subject_template", ""), tokens)
    body = render(campaign.get("body_template", ""), tokens)
    return subject, body


def validate_template(template: str, expected_tokens: list[str] | None = None) -> list[str]:
    """
    Check a template for unknown or missing tokens.
    Returns a list of warnings (empty = clean).
    """
    known_tokens = {
        "contact_name", "org_name", "org_reason", "fundraiser_name",
        "sender_name", "sender_email", "unsubscribe_link"
    }
    found = set(TOKEN_PATTERN.findall(template))
    warnings = []

    for token in found:
        if token not in known_tokens:
            warnings.append(f"Unknown token: {{{{{token}}}}}")

    if expected_tokens:
        for token in expected_tokens:
            if f"{{{{{token}}}}}" not in template:
                warnings.append(f"Missing expected token: {{{{{token}}}}}")

    return warnings
