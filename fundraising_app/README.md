# AutomatedFundraising
Furry Friends Shelter - Outreach Automation + CRM Dashboard

This project now combines two systems:

1. Outreach automation pipeline (discover orgs, extract contacts, email campaigns, tracking)
2. Internal fundraising CRM dashboard (donors, donations, campaigns, animals, events, stories, reports, team)

The dashboard runs on Flask and can use Supabase data when configured, with mock fallback for local UI development.

## Repo Layout

- Repository root contains GitHub Actions workflows in `.github/workflows/`
- Application code lives in `fundraising_app/`

## Quick Start (Local)

From the repository root:

```bash
cd fundraising_app
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Configure `.env` (optional for local UI smoke tests, required for Supabase-backed reads/writes):

```bash
cp .env.example .env
```

Required for Supabase-backed app mode:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Email note:
- SendGrid is currently inactive / under review, so outbound email send testing is paused.

## Run Dashboard Server

```bash
cd fundraising_app
python server.py
```

Open:
- `http://localhost:5000`

## First Admin Bootstrap (One-Time)

The app no longer auto-creates a hardcoded default admin account.

1. Set `AUTH_BOOTSTRAP_TOKEN` in `fundraising_app/.env`.
2. Start the server.
3. Create the initial admin with:

```bash
curl -X POST http://localhost:5000/api/auth/bootstrap/admin \
  -H "Content-Type: application/json" \
  -d '{
    "bootstrap_token": "YOUR_BOOTSTRAP_TOKEN",
    "email": "you@example.org",
    "password": "choose-a-strong-password",
    "full_name": "Your Name"
  }'
```

Bootstrap is only allowed while no active administrator account exists.

## API Endpoints (CRM + Dashboard)

Examples:
- `GET /api/health`
- `GET /api/fundraising/trends`
- `GET /api/donors`
- `GET /api/campaigns`
- `GET /api/animals`
- `GET /api/events`
- `GET /api/stories`
- `GET /api/reports`
- `GET /api/team`
- `GET /api/progress/runs`

Create endpoints (for UI integration/testing) are also available for:
- `/api/campaigns`
- `/api/animals`
- `/api/events`
- `/api/stories`
- `/api/reports/generate`
- `/api/team`
- `/api/progress/runs`

## Supabase Schema

Unified schema file (outreach + CRM):
- `db/schema.sql`

This preserves the original outreach tables and adds CRM entities required by the current dashboard design.

## Local Scripts

From the repository root:

```bash
# API smoke tests (mock mode if Supabase not configured)
python fundraising_app/scripts/smoke_test_server.py

# Optional: include write/create endpoint checks (creates test records)
SMOKE_TEST_ENABLE_WRITE_CHECKS=true python fundraising_app/scripts/smoke_test_server.py

# Pre-deploy checks (compile, imports, smoke tests, optional connection checks)
python fundraising_app/scripts/pre_deploy_check.py

# Optional deeper external validation (if Supabase env vars are set)
python fundraising_app/scripts/test_connections.py
```

Notes:
- Smoke tests run read/auth checks by default.
- Write/create checks are opt-in via `SMOKE_TEST_ENABLE_WRITE_CHECKS=true` to avoid polluting local/dev data.

## Outreach Pipeline Commands

From `fundraising_app/`:

```bash
python -m scraper.discover
python -c "from scraper.extract_contacts import run_extraction; run_extraction(min_score=5)"
python -m emailer.batch_send --campaign-id YOUR_CAMPAIGN_UUID --limit 50
python -c "from emailer.sync_tracking import sync_events; sync_events()"
```

Notes:
- `emailer.batch_send` now enforces a default 24-hour gap between sends to contacts in the same organization (`ORG_SEND_GAP_HOURS`).
- Email sending remains blocked operationally until a provider is active.

## GitHub Actions

Workflow files are in the repository root:
- `.github/workflows/discover-and-scrape.yml`
- `.github/workflows/send-campaign.yml`
- `.github/workflows/sync-tracking.yml`

Each workflow runs commands in `fundraising_app/` and the discover workflow now uploads a summary artifact.

## Email Template Tokens

Supported tokens include:
- `{{contact_name}}`
- `{{org_name}}`
- `{{org_reason}}`
- `{{fundraiser_name}}`
- `{{donation_impact}}`
- `{{sender_name}}`
- `{{sender_email}}`
- `{{unsubscribe_link}}`

## Current Status

- Frontend page buildout exists for all dashboard pages (HTML/CSS/JS)
- Flask backend now exposes a Supabase-aware CRM API with mock fallback
- Supabase unified CRM schema is defined in `db/schema.sql`
- Smoke tests and pre-deploy checks are available and passing locally in mock mode
- SendGrid is inactive, so live outbound email campaign validation is deferred
