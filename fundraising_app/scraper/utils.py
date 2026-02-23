"""
scraper/utils.py
Shared utilities: rate limiting, robots.txt checking, HTML helpers.
"""

import time
import random
import logging
from urllib.parse import urlparse, urljoin
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; FurryFriendsShelterBot/1.0; "
        "+https://furryfriendswa.org/bot)"
    )
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def polite_delay(min_s: float = 1.5, max_s: float = 3.5) -> None:
    """Sleep a random amount to avoid overwhelming servers."""
    time.sleep(random.uniform(min_s, max_s))


def can_fetch(url: str) -> bool:
    """
    Check robots.txt to see if our bot is allowed to fetch the URL.
    Returns True if allowed or robots.txt is unreachable.
    """
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(HEADERS["User-Agent"], url)
    except Exception:
        return True  # if we can't read robots.txt, proceed cautiously


def fetch_page(url: str, timeout: int = 15) -> BeautifulSoup | None:
    """
    Fetch a URL and return a BeautifulSoup object.
    Returns None on failure.
    """
    if not can_fetch(url):
        logger.warning(f"robots.txt disallows: {url}")
        return None
    try:
        polite_delay()
        resp = SESSION.get(url, timeout=timeout, allow_redirects=True)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch {url}: {e}")
        return None


def extract_emails_from_soup(soup: BeautifulSoup) -> list[str]:
    """Extract all mailto: email addresses from a parsed page."""
    import re
    emails = set()

    # mailto links
    for tag in soup.find_all("a", href=True):
        href = tag["href"]
        if href.startswith("mailto:"):
            email = href.replace("mailto:", "").split("?")[0].strip().lower()
            if email:
                emails.add(email)

    # Plain-text email pattern
    text = soup.get_text()
    pattern = r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
    for match in re.findall(pattern, text):
        emails.add(match.lower())

    # Filter out image/asset false positives
    emails = {e for e in emails if not any(
        e.endswith(ext) for ext in [".png", ".jpg", ".gif", ".svg", ".css", ".js"]
    )}
    return list(emails)


def extract_phone_from_soup(soup: BeautifulSoup) -> str | None:
    """Extract the first phone number found on a page."""
    import re
    text = soup.get_text()
    pattern = r"(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})"
    match = re.search(pattern, text)
    return match.group(0).strip() if match else None


def guess_contact_emails(first_name: str, last_name: str, domain: str) -> list[str]:
    """
    Generate plausible email guesses for a named individual at a domain.
    Useful when email is not found directly on the page.
    """
    first = first_name.lower().strip()
    last = last_name.lower().strip()
    return [
        f"{first}@{domain}",
        f"{first}.{last}@{domain}",
        f"{first[0]}{last}@{domain}",
        f"{first}{last[0]}@{domain}",
        f"contact@{domain}",
        f"info@{domain}",
        f"giving@{domain}",
        f"csr@{domain}",
    ]


def find_subpages(soup: BeautifulSoup, base_url: str,
                  keywords: list[str] | None = None) -> list[str]:
    """
    Return internal links whose href/text matches any keyword.
    Default keywords target contact/team/giving pages.
    """
    if keywords is None:
        keywords = [
            "contact", "team", "staff", "about", "giving",
            "donate", "csr", "philanthropy", "foundation",
            "responsibility", "community", "grant"
        ]
    found = []
    base_netloc = urlparse(base_url).netloc
    for tag in soup.find_all("a", href=True):
        href = tag["href"].lower()
        text = tag.get_text().lower()
        if any(kw in href or kw in text for kw in keywords):
            full_url = urljoin(base_url, tag["href"])
            if urlparse(full_url).netloc == base_netloc:
                found.append(full_url)
    return list(set(found))
