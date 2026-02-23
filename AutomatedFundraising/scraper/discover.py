"""
scraper/discover.py
Discovery engine — finds animal-welfare-aligned organizations nationally.
Writes results to Supabase organizations table.

Sources used:
  1. Google Custom Search / SerpAPI (if key available)
  2. Hardcoded seed list of high-value target categories
  3. Petfinder organization listing RSS
  4. Charity Navigator public search
"""

import os
import sys
import logging
import requests
import feedparser

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db.client import upsert_organization

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ── Configuration ────────────────────────────────────────────
SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "")

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
]

SEED_ORGANIZATIONS = [
    # Pet industry — verified public CSR programs
    {"name": "PetSmart Charities", "website": "https://www.petsmartcharities.org",
     "category": "pet_industry", "donation_potential_score": 10,
     "notes": "Dedicated animal welfare grant-making arm of PetSmart."},
    {"name": "Petco Love", "website": "https://petcolove.org",
     "category": "pet_industry", "donation_potential_score": 10,
     "notes": "Petco's charitable foundation. Grants to animal welfare orgs."},
    {"name": "Hill's Pet Nutrition Foundation", "website": "https://hillspet.com",
     "category": "pet_industry", "donation_potential_score": 9,
     "notes": "Science Diet maker. Active Food, Shelter, Love grant program."},
    {"name": "Purina Pro Plan Shelter Champions", "website": "https://proplanshelterstars.com",
     "category": "pet_industry", "donation_potential_score": 9,
     "notes": "Purina's shelter support program — food and supplies."},
    {"name": "Royal Canin USA", "website": "https://www.royalcanin.com/us",
     "category": "pet_industry", "donation_potential_score": 8,
     "notes": "Partners with shelters and rescues for product donations."},
    {"name": "Banfield Foundation", "website": "https://banfieldfoundation.org",
     "category": "pet_industry", "donation_potential_score": 9,
     "notes": "Funds preventive veterinary care at shelters."},
    {"name": "Zoetis Petcare", "website": "https://www.zoetispetcare.com",
     "category": "pet_industry", "donation_potential_score": 8,
     "notes": "Animal health company with shelter support programs."},
    {"name": "Tractor Supply Company Foundation", "website": "https://www.tractorsupply.com",
     "category": "pet_industry", "donation_potential_score": 7,
     "notes": "Annual Rescue Express program supports shelters."},
    {"name": "KONG Company", "website": "https://www.kongcompany.com",
     "category": "pet_industry", "donation_potential_score": 7,
     "notes": "Donates products to shelters and rescue groups."},
    {"name": "Kuranda Dog Beds", "website": "https://www.kuranda.com",
     "category": "pet_industry", "donation_potential_score": 6,
     "notes": "Shelter dog bed donation program."},
    # Vegan / plant-based brands
    {"name": "Beyond Meat", "website": "https://www.beyondmeat.com",
     "category": "vegan_brand", "donation_potential_score": 7,
     "notes": "Vegan brand with documented animal welfare giving."},
    {"name": "Impossible Foods", "website": "https://www.impossiblefoods.com",
     "category": "vegan_brand", "donation_potential_score": 7,
     "notes": "Mission-aligned brand; has supported animal welfare causes."},
    {"name": "Oatly", "website": "https://www.oatly.com",
     "category": "vegan_brand", "donation_potential_score": 6,
     "notes": "Values-driven brand; open to animal welfare co-promotion."},
    # Corporate CSR — national tech & consumer brands
    {"name": "Amazon (AmazonSmile / AWS Imagine Grant)",
     "website": "https://www.amazon.com/gp/charity",
     "category": "corporate_csr", "donation_potential_score": 8,
     "notes": "AmazonSmile donates 0.5% of purchases to nonprofits."},
    {"name": "Google.org", "website": "https://www.google.org",
     "category": "corporate_csr", "donation_potential_score": 7,
     "notes": "Google's philanthropic arm. Grants to nonprofits."},
    {"name": "Salesforce.org", "website": "https://www.salesforce.org",
     "category": "corporate_csr", "donation_potential_score": 7,
     "notes": "1-1-1 model. Grants + free tech to nonprofits."},
    {"name": "Microsoft Philanthropies", "website": "https://www.microsoft.com/en-us/philanthropies",
     "category": "corporate_csr", "donation_potential_score": 7,
     "notes": "Grants + in-kind tech to qualifying nonprofits."},
    # Foundations
    {"name": "Maddie's Fund", "website": "https://www.maddiesfund.org",
     "category": "foundation", "donation_potential_score": 10,
     "notes": "Leading funder of animal shelter and rescue innovation."},
    {"name": "Petfinder Foundation", "website": "https://www.petfinderfoundation.com",
     "category": "foundation", "donation_potential_score": 9,
     "notes": "Direct grants to shelters and rescues."},
    {"name": "American Humane", "website": "https://www.americanhumane.org",
     "category": "nonprofit", "donation_potential_score": 8,
     "notes": "Grant programs and partnerships for shelters."},
    {"name": "Doris Day Animal Foundation",
     "website": "https://www.dorisdayanimalfoundation.org",
     "category": "foundation", "donation_potential_score": 8,
     "notes": "Grants to companion animal shelters and spay/neuter programs."},
    {"name": "Grey Muzzle Organization", "website": "https://www.greymuzzle.org",
     "category": "foundation", "donation_potential_score": 7,
     "notes": "Grants specifically for senior dog programs at shelters."},
    {"name": "PetSafe Foundation", "website": "https://www.petsafe.net",
     "category": "pet_industry", "donation_potential_score": 7,
     "notes": "Product donations and grants to animal welfare orgs."},
]


def search_via_serpapi(query: str, num: int = 10) -> list[dict]:
    """Use SerpAPI to run a Google search and return organic results."""
    if not SERPAPI_KEY:
        return []
    try:
        resp = requests.get(
            "https://serpapi.com/search",
            params={"q": query, "api_key": SERPAPI_KEY, "num": num, "engine": "google"},
            timeout=15
        )
        resp.raise_for_status()
        results = resp.json().get("organic_results", [])
        orgs = []
        for r in results:
            orgs.append({
                "name": r.get("title", "")[:200],
                "website": r.get("link", ""),
                "category": "other",
                "donation_potential_score": 5,
                "notes": r.get("snippet", "")[:500],
                "source_url": r.get("link", ""),
            })
        return orgs
    except Exception as e:
        logger.warning(f"SerpAPI error for query '{query}': {e}")
        return []


def fetch_petfinder_orgs() -> list[dict]:
    """Pull shelter listings from Petfinder RSS feed."""
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
                "source_url": entry.get("link", ""),
            })
        return orgs
    except Exception as e:
        logger.warning(f"Petfinder RSS error: {e}")
        return []


def run_discovery() -> int:
    """
    Main entry point — discover orgs and upsert to Supabase.
    Returns count of orgs processed.
    """
    all_orgs: list[dict] = []

    # 1. Seed list
    logger.info(f"Loading {len(SEED_ORGANIZATIONS)} seed organizations...")
    all_orgs.extend(SEED_ORGANIZATIONS)

    # 2. SerpAPI dynamic search
    if SERPAPI_KEY:
        logger.info("Running Google searches via SerpAPI...")
        for query in SEARCH_QUERIES:
            results = search_via_serpapi(query)
            logger.info(f"  '{query[:50]}...' → {len(results)} results")
            all_orgs.extend(results)
    else:
        logger.info("SERPAPI_KEY not set — skipping Google search.")

    # 3. Petfinder RSS
    logger.info("Fetching Petfinder organization listings...")
    pf_orgs = fetch_petfinder_orgs()
    logger.info(f"  Petfinder → {len(pf_orgs)} orgs")
    all_orgs.extend(pf_orgs)

    # Deduplicate by name
    seen = set()
    unique_orgs = []
    for org in all_orgs:
        key = org.get("name", "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            unique_orgs.append(org)

    logger.info(f"Upserting {len(unique_orgs)} unique organizations to Supabase...")
    success = 0
    for org in unique_orgs:
        try:
            upsert_organization(org)
            success += 1
        except Exception as e:
            logger.error(f"Failed to upsert '{org.get('name')}': {e}")

    logger.info(f"Discovery complete. {success}/{len(unique_orgs)} orgs saved.")
    return success


if __name__ == "__main__":
    run_discovery()
