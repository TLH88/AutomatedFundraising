# Fundraiser Lead Gen → Close: Automated Pipeline
## Plan of Action

**Project:** Fundraiser Lead Gen 2 Close
**Goal:** Fully automated pipeline to research, identify, contact, and track potential donors for animal welfare fundraisers
**Date:** February 22, 2026

---

## Executive Summary

This system will automate the full donor acquisition funnel — from identifying high-potential organizations online, extracting contact details, storing them in a structured database, and launching personalized email campaigns — all orchestrated via GitHub Actions and backed by Supabase (Postgres).

---

## Architecture Overview

```
[GitHub Actions Scheduler]
        |
        ├── 1. Research & Discovery (scheduled weekly)
        │       └── Python scraper → candidate org list
        |
        ├── 2. Contact Extraction (triggered after discovery)
        │       └── BeautifulSoup4 / Playwright → contact data
        |
        ├── 3. Database Upsert (after each scrape run)
        │       └── Supabase Postgres → organizations + contacts tables
        |
        ├── 4. Email Campaigns (scheduled or manual trigger)
        │       └── Personalized outreach → batch SMTP / SendGrid
        |
        └── 5. Tracking & Reporting (daily)
                └── Email status updates → Supabase email_sends table
```

---

## Phase 1: Target Research & Discovery

### Objective
Identify companies and organizations with a high likelihood of donating to animal welfare fundraisers.

### Target Categories
- **Pet industry companies** — retailers, food brands, supply companies
- **Vegan/plant-based brands** — food, lifestyle, apparel
- **Animal welfare foundations & nonprofits** — co-sponsorship potential
- **Corporate CSR programs** — tech, retail, and consumer brands with documented giving programs
- **Local businesses** — veterinary clinics, groomers, pet boarding/daycare
- **Foundations & grant-making bodies** — community foundations, family foundations focused on animals

### Discovery Sources
- Google Search (via SerpAPI or direct scraping with BeautifulSoup)
- Charity Navigator & GuideStar (public data on nonprofits)
- Petfinder.com organization listings
- RSS feeds from animal welfare news outlets
- LinkedIn public company pages (limited, no auth required)
- Company CSR/responsibility pages (`/csr`, `/giving`, `/foundation` paths)

### Scoring / Prioritization
Each discovered org gets a **Donation Potential Score (1–10)** based on:
- Documented prior animal welfare giving
- Industry alignment (pet, vegan, lifestyle)
- Company size / revenue indicators
- Geographic proximity to the fundraiser
- Presence of a dedicated philanthropy contact

---

## Phase 2: Contact Extraction

### Objective
For each qualified organization, extract actionable contact data.

### Data Points to Capture
| Field | Source |
|---|---|
| Organization name | Website title / About page |
| Website URL | Input from discovery |
| Contact person name | Staff/Team pages, press releases |
| Title/Role | Staff pages (VP CSR, Director of Giving, etc.) |
| Email address | Contact pages, footer, mailto: links |
| Phone number | Contact pages, footer |
| Justification for selection | Scraped context + scoring logic |

### Scraping Strategy
- **Static pages**: `requests` + `BeautifulSoup4` (fast, no overhead)
- **JS-rendered pages**: `Playwright` headless browser (used only when static scraping fails)
- **Email patterns**: Pattern matching when direct email not found (e.g., `firstname.lastname@domain.com` inferred from name + domain)
- **Rate limiting**: Respectful delays (1–3s between requests), honor `robots.txt`

---

## Phase 3: Supabase Database Schema

### Tables

#### `organizations`
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website TEXT,
  category TEXT,  -- pet_industry, vegan_brand, nonprofit, corporate_csr, local_business, foundation
  donation_potential_score INTEGER CHECK (score BETWEEN 1 AND 10),
  notes TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `contacts`
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  full_name TEXT,
  title TEXT,
  email TEXT,
  phone TEXT,
  justification TEXT,
  confidence TEXT CHECK (confidence IN ('high','medium','low')),
  do_not_contact BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `email_campaigns`
```sql
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,  -- supports {{contact_name}}, {{org_name}}, {{custom_field}} tokens
  status TEXT CHECK (status IN ('draft','active','paused','completed')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `email_sends`
```sql
CREATE TABLE email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id),
  contact_id UUID REFERENCES contacts(id),
  sent_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('pending','sent','bounced','opened','replied','unsubscribed')),
  error_message TEXT,
  tracking_pixel_id TEXT,  -- for open tracking
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes
- `contacts(email)` — deduplicate and fast lookup
- `email_sends(contact_id, campaign_id)` — prevent duplicate sends
- `organizations(donation_potential_score DESC)` — priority querying

---

## Phase 4: Email Campaign System

### Objective
Send personalized, high-quality outreach at scale with full tracking.

### Email Sending Stack
- **Primary**: SendGrid API (recommended for deliverability, bounce handling, open tracking)
- **Fallback**: SMTP via Gmail or Mailgun
- All credentials stored as **GitHub Actions Secrets** / **Supabase Vault**

### Personalization Tokens
Each email template supports dynamic tokens:
```
{{contact_name}}     → First name of contact
{{org_name}}         → Organization name
{{fundraiser_name}}  → Name of the specific fundraiser
{{donation_impact}}  → Custom message about impact (set per campaign)
{{sender_name}}      → Name of the person sending (staff member)
```

### Batch Processing
- Maximum **50 emails per batch** (respects sending limits)
- Minimum **24-hour gap** between contacts in same org
- **Unsubscribe** handling — any reply with unsubscribe keyword → auto-flag `do_not_contact = true`
- Scheduled via GitHub Actions cron (configurable)

### Email Tracking
- Open tracking via 1x1 pixel (SendGrid handles natively)
- Click tracking for any links in emails
- All events written back to `email_sends` table via webhook

---

## Phase 5: GitHub Actions Workflows

### Workflow 1: `discover-and-scrape.yml`
**Trigger**: Weekly (Sunday 6AM) or manual
**Steps**:
1. Checkout repo
2. Set up Python + install dependencies
3. Run discovery script → candidate list
4. Run contact extraction script
5. Upsert results to Supabase
6. Output summary report as Actions artifact

### Workflow 2: `send-campaign.yml`
**Trigger**: Manual (workflow_dispatch with campaign_id input) or scheduled
**Steps**:
1. Pull pending sends from Supabase
2. Render personalized emails
3. Batch send via SendGrid
4. Write send status back to Supabase

### Workflow 3: `sync-tracking.yml`
**Trigger**: Daily (via SendGrid webhook or polling)
**Steps**:
1. Pull latest email event data from SendGrid
2. Update `email_sends` status in Supabase
3. Flag bounced / unsubscribed contacts

---

## Repo Structure

```
fundraiser-lead-gen/
├── .github/
│   └── workflows/
│       ├── discover-and-scrape.yml
│       ├── send-campaign.yml
│       └── sync-tracking.yml
├── scraper/
│   ├── discover.py          # Target org discovery
│   ├── extract_contacts.py  # Contact data extraction
│   ├── playwright_helper.py # JS-rendered page fallback
│   └── utils.py             # Rate limiting, robots.txt, helpers
├── emailer/
│   ├── render_template.py   # Token replacement engine
│   ├── batch_send.py        # SendGrid batch sending
│   └── templates/
│       ├── cold_outreach.txt
│       └── follow_up.txt
├── db/
│   ├── schema.sql           # Full Supabase schema
│   └── client.py            # Supabase Python client wrapper
├── requirements.txt
├── .env.example             # Template for secrets (never committed)
└── README.md
```

---

## Required Credentials & Secrets

| Secret Name | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) |
| `SENDGRID_API_KEY` | Email sending |
| `SERPAPI_KEY` | (Optional) Google search for discovery |

All stored as **GitHub Actions Secrets** — never hardcoded.

---

## Build Sequence (Recommended Order)

| Step | Deliverable | Priority | Status |
|---|---|---|---|
| 1 | Supabase schema + migrations | ✅ First (everything depends on this) | ✅ Complete |
| 2 | `db/client.py` — database wrapper | ✅ Core utility | ✅ Complete |
| 3 | `scraper/discover.py` — discovery engine | High | ✅ Complete |
| 4 | `scraper/extract_contacts.py` — contact extractor | High | ✅ Complete |
| 5 | `emailer/render_template.py` + templates | Medium | ✅ Complete |
| 6 | `emailer/batch_send.py` — SendGrid integration | Medium | ✅ Complete |
| 7 | GitHub Actions workflows | Medium | ✅ Complete |
| 8 | `sync-tracking.yml` — webhook/polling | Lower | ✅ Complete |
| 9 | Web Dashboard UI — 13 pages | High | 🔄 In Progress |
| 10 | Backend integration — Connect UI to Supabase | High | ⏳ Pending |
| 11 | Real-time progress updates | Medium | ⏳ Pending |
| 12 | End-to-end test run | Final | ⏳ Pending |

### Phase 9: Web Dashboard UI Pages

| # | Page | Priority | Status |
|---|---|---|---|
| 9.1 | Dashboard (Home) | Critical | ✅ Complete |
| 9.2 | Donors & Sponsors | High | 🔄 In Progress |
| 9.3 | Campaigns Management | High | ⏳ Pending |
| 9.4 | Analytics & Reports | Medium | ⏳ Pending |
| 9.5 | Impact Reports | Medium | ⏳ Pending |
| 9.6 | Active Campaigns Detail | Medium | ⏳ Pending |
| 9.7 | Animals Helped | Medium | ⏳ Pending |
| 9.8 | Events Calendar | Low | ⏳ Pending |
| 9.9 | Communications Center | Medium | ⏳ Pending |
| 9.10 | Success Stories | Low | ⏳ Pending |
| 9.11 | Settings | Low | ⏳ Pending |
| 9.12 | Team Management | Low | ⏳ Pending |
| 9.13 | Help & Resources | Low | ⏳ Pending |

---

## Key Decisions Needed Before Build

1. **What fundraiser is this for?** (name, org, mission) — needed for email personalization
2. **Email sending service** — SendGrid (recommended), Mailgun, or Gmail SMTP?
3. **GitHub repo** — does one exist, or does it need to be created?
4. **Supabase project** — existing project or new one?
5. **Geographic focus** — local, statewide, national?
6. **Sender identity** — who do emails come from? (name + email address)
7. **Volume expectations** — how many orgs/contacts to target initially?

---

## Success Metrics

- **# of orgs identified** per weekly scrape run
- **Contact extraction rate** (% of orgs with at least one valid email)
- **Email open rate** (target: >25%)
- **Reply rate** (target: >5%)
- **Conversion rate** (replies that become donors)

---

*Plan version 1.0 — Ready for review and green light to build.*

---

## PLAN UPDATE (February 23, 2026) - CRM Expansion + Validation Gates

This plan has been expanded beyond the original outreach-only pipeline.

### New Active Workstreams
1. Unified CRM data model in Supabase (outreach + fundraising dashboard entities)
2. Flask API backend integration for the existing 13-page dashboard UI
3. Automation progress tracking data model (`automation_runs`, `automation_run_events`) for future 5-second UI updates
4. Standardized validation gates (smoke tests + pre-deploy checks) before push/deploy

### Current Build Sequence (Superseding prior Step 9+ statuses)
- COMPLETE: Frontend page buildout (13 pages)
- COMPLETE: Supabase CRM schema design file (`AutomatedFundraising/db/schema.sql`)
- COMPLETE: Flask API refactor to Supabase-aware CRM endpoints with mock fallback (`AutomatedFundraising/server.py`, `AutomatedFundraising/db/crm.py`)
- COMPLETE: GitHub workflow relocation/path fixes to repo-root `.github/workflows`
- COMPLETE: Discover workflow summary artifact output
- COMPLETE: `{{donation_impact}}` token support
- COMPLETE: 24-hour same-org send cooldown enforcement
- IN PROGRESS: Page-level frontend wiring to live API responses (beyond dashboard chart)
- PENDING: Real-time progress UI polling/SSE integration on frontend
- PENDING: Apply unified CRM schema to live Supabase project and seed CRM tables
- BLOCKED: Live outbound email send/tracking validation (SendGrid inactive; provider under evaluation)

### Required Validation Gates Going Forward
- Gate A (Local): `python AutomatedFundraising/scripts/pre_deploy_check.py`
- Gate B (Integration): `python AutomatedFundraising/scripts/test_connections.py` with Supabase env vars set
- Gate C (Workflow): verify root `.github/workflows` discovery in GitHub Actions UI after push
- Gate D (Email): provider-specific smoke test only after provider becomes active
