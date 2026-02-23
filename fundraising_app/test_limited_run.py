"""
test_limited_run.py
Limited test run: Discover 10 organizations, extract contacts, and store in Supabase.
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))

from scraper.discover import SEED_ORGANIZATIONS
from db.client import upsert_organization, get_organizations
from scraper.extract_contacts import extract_contacts_static, upsert_contact

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def run_limited_test(limit: int = 10):
    """
    Run a limited test with only the first N seed organizations.
    """
    logger.info(f"Starting limited test run with {limit} organizations...")

    # Step 1: Insert first 10 seed organizations
    logger.info(f"\nStep 1: Upserting first {limit} seed organizations to database...")
    test_orgs = SEED_ORGANIZATIONS[:limit]

    success_count = 0
    for org in test_orgs:
        try:
            upsert_organization(org)
            logger.info(f"  ✓ {org['name']}")
            success_count += 1
        except Exception as e:
            logger.error(f"  ✗ Failed to upsert '{org['name']}': {e}")

    logger.info(f"Successfully upserted {success_count}/{limit} organizations")

    # Step 2: Fetch organizations from database
    logger.info(f"\nStep 2: Fetching organizations from database...")
    try:
        orgs = get_organizations(min_score=6)  # Get high-value orgs only
        logger.info(f"Retrieved {len(orgs)} organizations with score >= 6")
    except Exception as e:
        logger.error(f"Failed to fetch organizations: {e}")
        return

    # Step 3: Extract contacts for each organization
    logger.info(f"\nStep 3: Extracting contacts from {len(orgs)} organization websites...")
    total_contacts = 0

    for i, org in enumerate(orgs, 1):
        org_name = org.get('name', 'Unknown')
        org_id = org.get('id')
        website = org.get('website', '')

        logger.info(f"\n[{i}/{len(orgs)}] Processing: {org_name}")
        logger.info(f"  Website: {website}")

        try:
            contacts = extract_contacts_static(website, org_id)

            if contacts:
                logger.info(f"  Found {len(contacts)} contact(s)")
                for contact in contacts:
                    try:
                        upsert_contact(contact)
                        total_contacts += 1
                        logger.info(f"    ✓ {contact.get('full_name', 'Unknown')} - {contact.get('email', 'No email')}")
                    except Exception as e:
                        logger.error(f"    ✗ Failed to save contact: {e}")
            else:
                logger.info(f"  No contacts found")

        except Exception as e:
            logger.error(f"  Error extracting contacts: {e}")

    logger.info(f"\n{'='*60}")
    logger.info(f"TEST COMPLETE")
    logger.info(f"{'='*60}")
    logger.info(f"Organizations added: {success_count}")
    logger.info(f"Contacts extracted: {total_contacts}")
    logger.info(f"\nResults are ready for review in Supabase:")
    logger.info(f"  - Organizations: https://kjbbdqqqloljzxikblwa.supabase.co/project/kjbbdqqqloljzxikblwa/editor")
    logger.info(f"  - Contacts: https://kjbbdqqqloljzxikblwa.supabase.co/project/kjbbdqqqloljzxikblwa/editor")
    logger.info(f"{'='*60}\n")


if __name__ == "__main__":
    run_limited_test(limit=10)
