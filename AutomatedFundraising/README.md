# AutomatedFundraising
**Furry Friends Shelter — Automated Donor Outreach Pipeline**

Automated end-to-end pipeline: discovers animal-welfare-aligned organizations nationally, extracts contact information, stores everything in Supabase, and sends personalized email campaigns via SendGrid — all orchestrated via GitHub Actions.

---

## Quick Start

### 1. Clone the Repo
```bash
git clone https://github.com/TLH88/AutomatedFundraising.git
cd AutomatedFundraising
```

### 2. Set Up Python Environment
```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure Environment Variables
```bash
cp .env.example .env
# Edit .env with your Supabase URL, publishable key, and SendGrid API key
```

### 4. Add GitHub Actions Secrets
In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret Name | Value |
|---|---|
| `SUPABASE_URL` | `https://kjbbdqqqloljzxikblwa.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_U-wrJ6Pu5DhmSDcon6JyAg_0cndO0ab` |
| `SENDGRID_API_KEY` | Your SendGrid API key |
| `SENDER_NAME` | `Hope from Furry Friends` |
| `SENDER_EMAIL` | `hope@furryfriendswa.org` |
| `FUNDRAISER_NAME` | `2026 Animal Rescue Campaign` |
| `UNSUBSCRIBE_BASE_URL` | `https://furryfriendswa.org/unsubscribe` |
| `SERPAPI_KEY` | *(optional)* SerpAPI key for Google search |

---

## Running Locally

```bash
# Discover organizations
python -m scraper.discover

# Extract contacts (min donation score = 5)
python -c "from scraper.extract_contacts import run_extraction; run_extraction(min_score=5)"

# Send a campaign batch (get campaign UUID from Supabase)
python -m emailer.batch_send --campaign-id YOUR_CAMPAIGN_UUID --limit 50

# Sync email tracking from SendGrid
python -c "from emailer.sync_tracking import sync_events; sync_events()"
```

---

## GitHub Actions Workflows

### `discover-and-scrape.yml`
- **Schedule**: Every Sunday at 6 AM UTC
- **What it does**: Runs discovery + contact extraction, upserts to Supabase
- **Manual trigger**: Go to Actions → Discover & Scrape Organizations → Run workflow

### `send-campaign.yml`
- **Trigger**: Manual only (staff-initiated from GitHub Actions UI)
- **What it does**: Sends a batch of personalized emails for a specific campaign
- **Required input**: `campaign_id` (UUID from Supabase `email_campaigns` table)
- **How to run**: Actions → Send Email Campaign Batch → Run workflow → enter campaign UUID

### `sync-tracking.yml`
- **Schedule**: Daily at 8 AM UTC
- **What it does**: Pulls open/click/bounce/unsubscribe events from SendGrid → updates Supabase

---

## Sending Your First Campaign

1. **Open Supabase** → Table Editor → `email_campaigns`
2. Find the default **"Cold Outreach — Animal Welfare Donors"** campaign
3. Change its `status` from `draft` → `active`
4. Copy its `id` (UUID)
5. Go to GitHub → Actions → **Send Email Campaign Batch** → Run workflow
6. Paste the UUID into the `campaign_id` field → click **Run workflow**

Monitor results in real-time in Supabase: `email_sends` table.

---

## Supabase Table Reference

| Table | Purpose |
|---|---|
| `organizations` | Discovered orgs with category + donation score |
| `contacts` | Extracted contacts with name, email, phone, justification |
| `email_campaigns` | Campaign templates (subject + body with `{{tokens}}`) |
| `email_sends` | Full send log with status tracking per contact per campaign |

Staff can view and filter all data directly from the **Supabase dashboard** — no code required.

---

## Sender Identity

**Recommended**: `Hope from Furry Friends` <hope@furryfriendswa.org>

Research consistently shows that emails from a warm first name (vs. an organization name) generate 20–30% higher open rates. "Hope" is mission-aligned, memorable, and approachable — exactly what fundraising outreach needs.

Make sure `hope@furryfriendswa.org` is verified as a sender in your SendGrid account before running campaigns.

---

## Email Template Tokens

| Token | Value |
|---|---|
| `{{contact_name}}` | Recipient's first name (fallback: "Friend") |
| `{{org_name}}` | Organization name |
| `{{org_reason}}` | Why this org was selected |
| `{{fundraiser_name}}` | Active campaign name |
| `{{sender_name}}` | Sender full name |
| `{{sender_email}}` | Sender email address |
| `{{unsubscribe_link}}` | Unique unsubscribe URL per contact |

---

## Tech Stack

- **Compute + Scheduler**: GitHub Actions
- **Scraping**: Python, requests, BeautifulSoup4, feedparser (+ optional Playwright)
- **Storage**: Supabase (Postgres)
- **Email**: SendGrid
- **Staff Access**: Supabase table UI

---

*Built for Furry Friends Shelter — because every animal deserves a second chance.*
