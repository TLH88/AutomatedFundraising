# AutomatedFundraising — Scope Tracker
**Project:** Furry Friends Shelter — Fundraiser Lead Gen → Close
**Last Updated:** February 22, 2026

---

## Purpose

This document tracks the full scope of the AutomatedFundraising project — what was originally committed to, what decisions were made during development, what new requirements have been added, and what has been explicitly deferred or excluded. Updated at the end of every work session.

---

## Original Scope (from PLAN_OF_ACTION.md — Feb 22, 2026)

The following was the committed scope at the start of the build:

**Core Pipeline**
- Research and identify companies/orgs with high potential to donate to animal welfare fundraisers
- Scrape website data to find contact info or identify individuals responsible for charitable giving
- Build a Supabase database capturing: org name, contact name, email, phone, and justification for selection
- Send personalized, tailored email campaigns from the database
- Batch process email sending and track every email sent to each org or contact

**Tech Stack (Fixed)**
- Compute + Scheduler: GitHub Actions
- Scraping: Python (requests, BeautifulSoup4, feedparser for RSS), Playwright optional
- Storage + Query UI: Supabase (Postgres + dashboard)
- Staff Access: Supabase table UI

**Geographic Scope:** National (USA)
**Volume Target:** 200–1,000 organizations initially
**Email Service:** SendGrid (decided during build)

---

## Scope Changes Log

Changes are recorded in chronological order. Each entry notes the date, what changed, why, and who drove the decision.

---

### Change #001 — SendGrid Selected as Email Provider
**Date:** Feb 22, 2026
**Type:** Decision / Clarification
**Initiated by:** Tony (answered during clarification Q&A)
**Original:** Plan referenced SendGrid, Mailgun, or Gmail SMTP as options
**Decision:** SendGrid selected — best balance of cost (free tier: 100/day) and ease of setup
**Impact:** `emailer/batch_send.py` and `emailer/sync_tracking.py` built exclusively on SendGrid API. No SMTP or Mailgun code included.
**Status:** ✅ Implemented

---

### Change #002 — Sender Identity: "Hope from Furry Friends"
**Date:** Feb 22, 2026
**Type:** New requirement (not in original plan)
**Initiated by:** Tony (requested sender name recommendation)
**Detail:** Tony requested help determining a sender name and email address to maximize open and click-through rates. Research-backed recommendation made: warm first name outperforms organizational names by 20–30% for open rates.
**Decision:** Sender identity set to `Hope from Furry Friends` at `hope@furryfriendswa.org`
**Impact:** Hardcoded as default in `render_template.py`; configurable via `SENDER_NAME` / `SENDER_EMAIL` env vars
**Status:** ✅ Implemented (SendGrid sender verification by Tony still pending)

---

### Change #003 — Supabase Publishable Key (Replaces Service Role Key)
**Date:** Feb 22, 2026
**Type:** New requirement / security improvement
**Initiated by:** Tony (explicit request)
**Original:** Plan specified `SUPABASE_SERVICE_KEY` (admin-level, bypasses RLS)
**Decision:** Switch to modern Supabase publishable key (`sb_publishable_...`) — governs access via RLS policies, safer for GitHub Actions usage
**Impact:**
- `db/client.py` updated to read `SUPABASE_PUBLISHABLE_KEY`
- 11 RLS policies created for the `anon` role across all 4 tables
- All 3 GitHub Actions workflows updated
- `.env.example` and `README.md` updated
- `SUPABASE_SERVICE_KEY` removed from all files
**Status:** ✅ Implemented

---

### Change #004 — Security Hardening (RLS + Function Search Path)
**Date:** Feb 22, 2026
**Type:** Security requirement (emerged from Supabase security advisor)
**Initiated by:** Supabase security advisor flags (surfaced during verification)
**Detail:** After schema migration, Supabase flagged:
  - ERROR: RLS disabled on all 4 public tables
  - WARN: `update_updated_at()` function had mutable search_path
**Decision:** Fix both proactively before any data or sends go live
**Impact:**
- RLS enabled on all 4 tables
- `update_updated_at()` rewritten with `SET search_path = public` and `SECURITY DEFINER`
- All security flags resolved to INFO level or cleared
**Status:** ✅ Implemented

---

### Change #005 — Seed Organization List (25 Orgs Pre-Loaded)
**Date:** Feb 22, 2026
**Type:** Scope enhancement (beyond original plan)
**Initiated by:** Claude (proactive quality improvement)
**Original plan:** Discovery would rely on scraping and search
**Enhancement:** 25 high-value organizations hard-coded as a seed list in `scraper/discover.py` — verified, pre-scored, and ready immediately without needing SerpAPI or a scrape run. Includes: PetSmart Charities, Petco Love, Maddie's Fund, Banfield Foundation, Hill's, Google.org, Salesforce.org, Microsoft Philanthropies, and more.
**Impact:** First run produces meaningful results even without SerpAPI key
**Status:** ✅ Implemented

---

### Change #006 — Confidence Scoring Added to Contacts
**Date:** Feb 22, 2026
**Type:** Schema enhancement (not in original plan)
**Initiated by:** Claude (quality and usability improvement)
**Detail:** `contacts` table includes a `confidence` field (high/medium/low) indicating how reliable the extracted email/contact is. High = direct match or name-matched email; Medium = named person, generic email; Low = no named person, best available email.
**Impact:** Staff can filter by confidence in Supabase table UI; prioritize high-confidence leads
**Status:** ✅ Implemented

---

### Change #007 — `failed` Status Added to email_sends
**Date:** Feb 22, 2026
**Type:** Schema enhancement (not in original plan)
**Initiated by:** Claude (operational requirement for error handling)
**Original plan:** Status options: pending, sent, bounced, opened, replied, unsubscribed
**Enhancement:** Added `failed` status — captures sends where the SendGrid API call itself failed (network error, invalid API key, etc.), distinct from a bounce (which is a delivery failure post-send)
**Impact:** Better operational visibility; failed sends can be retried separately
**Status:** ✅ Implemented

---

### Change #008 — Real-Time Progress Updates for Script Execution
**Date:** Feb 22, 2026
**Type:** New requirement / UX enhancement
**Initiated by:** Tony
**Original:** Scripts run via GitHub Actions or CLI with no live progress visibility until completion
**New requirement:** System needs to provide users with script running updates that refresh every 5 seconds until completion, at which point the user is notified the script has completed successfully
**Impact:**
- Requires WebSocket or server-sent events (SSE) for real-time updates
- Scripts need to emit progress events during execution
- Frontend component to display progress with auto-refresh
- Affects: all three workflow scripts (discover, send-campaign, sync-tracking)
**Status:** ⏳ Proposed — requires architecture discussion
**Implementation Options:**
1. GitHub Actions live logs viewer (simplest — use GitHub's native UI)
2. Custom webhook endpoint that receives progress events → stores in Supabase → UI polls every 5s
3. WebSocket server for true real-time streaming (most complex)

---

### Change #009 — Web UI for Tool Management
**Date:** Feb 22, 2026
**Type:** New requirement / Major scope addition
**Initiated by:** Tony
**Original:** Staff access via Supabase table UI only; GitHub Actions triggered manually via GitHub UI
**New requirement:** A UI will be needed to allow for easy access, execution, and management of this tool
**Impact:** Major scope expansion — requires building a full web application
**Proposed features:**
- Dashboard showing org/contact counts, recent activity, campaign status
- One-click buttons to trigger discovery, scraping, and email campaigns
- Campaign management (create, edit, pause campaigns)
- View organizations and contacts with filtering/search
- Real-time progress indicators (integrates with Change #008)
- Email send logs and tracking data visualization
**Technology Stack Options:**
1. **Next.js + Supabase Auth** — modern, fast, works with existing Supabase backend
2. **Streamlit (Python)** — rapid prototyping, Python-native, simpler but less polished
3. **React + Supabase** — maximum flexibility, more development time
**Status:** ⏳ Proposed — requires tech stack selection and architecture design
**Estimated Effort:** 2-3 full development sessions (20-30 hours)

---

### Change #010 — Web UI Complete Page Buildout Plan
**Date:** Feb 23, 2026
**Type:** Implementation plan / Scope breakdown
**Initiated by:** Tony
**Original:** Web UI proposed as single major feature (Change #009)
**Decision:** Break down UI into 11 distinct page buildouts based on navigation structure
**Impact:** Creates structured development path for complete dashboard implementation
**Pages to build:**
1. ✅ **Dashboard** — Overview with fundraising trends, donations, impact metrics (COMPLETE)
2. **Campaigns Page** — View, create, edit, and manage fundraising campaigns
3. **Donors Page** — Donor directory with profiles, donation history, and engagement tracking
4. **Analytics Page** — Deep-dive analytics with custom reports and data visualization
5. **Impact Reports Page** — Generate and view impact reports for stakeholders
6. **Active Campaigns Detail** — Detailed view of individual campaign performance
7. **Animals Helped Page** — Showcase animals rescued/helped with stories and photos
8. **Events Calendar** — Manage fundraising events, adoption days, and volunteer activities
9. **Communications Center** — Email campaign management and messaging hub
10. **Success Stories** — Publish and manage animal success stories for marketing
11. **Settings Page** — Application configuration, user preferences, integrations
12. **Team Management** — User management, roles, permissions
13. **Help & Resources** — Documentation, FAQs, support contact

**Technology Stack Selected:** HTML/CSS/JS with Flask backend (already implemented)
**Status:** ✅ Implemented — Dashboard complete, remaining pages queued
**Estimated Effort:** 1-2 hours per page (13-26 hours total)

---

## Pending Scope Items (Planned but Not Yet Built)

These items were in the original plan or emerged during development but have not been implemented yet. They are candidates for upcoming work sessions.

| # | Item | Source | Priority | Notes |
|---|---|---|---|---|
| P-001 | `db/schema.sql` file | Original plan repo structure | Medium | Schema applied directly via Supabase MCP. File should be created for reproducibility and local development setup |
| P-002 | `{{donation_impact}}` token | Original plan email tokens | Medium | Listed in plan but not implemented in `render_template.py`. Would allow per-campaign custom impact messaging |
| P-003 | 24-hour gap between org sends | Original plan batch processing | Medium | Plan specified "minimum 24-hour gap between contacts in same org" — not enforced in `batch_send.py` |
| P-004 | Summary artifact from discover workflow | Original plan workflow steps | Low | Plan specified "output summary report as Actions artifact" — not added to `discover-and-scrape.yml` |
| P-005 | `scraper/playwright_helper.py` as separate module | Original plan repo structure | Low | Playwright currently inline in `extract_contacts.py`. Refactor deferred. |
| P-006 | Charity Navigator / GuideStar discovery source | Original plan discovery sources | Low | Both require API keys or auth. Deferred until API access is confirmed. |
| P-007 | Additional animal welfare RSS news feeds | Original plan discovery sources | Low | Only Petfinder RSS currently implemented |
| P-008 | LinkedIn public org pages scraping | Original plan discovery sources | Low | Requires careful handling; deferred indefinitely |
| P-009 | End-to-end test run | Original plan step 9 | HIGH | Blocked by: GitHub Secrets + SendGrid sender verification |

---

## Out of Scope (Explicitly Excluded)

These items are deliberately not included in this project and should not be added without a formal scope discussion.

| Item | Reason |
|---|---|
| CRM integration (Salesforce, HubSpot, etc.) | Not in tech stack; Supabase serves as the record of truth |
| Inbound reply handling / inbox management | SendGrid webhooks track opens/clicks/bounces only; reply reading is a manual staff process |
| A/B testing framework for email templates | Out of scope for V1; can be added if open rates underperform |
| Social media outreach (LinkedIn, Twitter DMs) | Not in plan; adds legal complexity |
| SMS / phone outreach automation | Not in plan; requires different compliance framework (TCPA) |
| Payment processing / donation intake | Separate system; not part of the outreach pipeline |
| Donor relationship management (gift tracking, stewardship) | Downstream of this pipeline; separate tool/process |
| Multi-shelter deployment | Currently built specifically for Furry Friends Shelter |
| ~~Public-facing web UI for staff~~ | ~~Moved to scope — see Change #009~~ |

---

## External Dependencies & Blockers

| Dependency | Owner | Status | Blocks |
|---|---|---|---|
| `hope@furryfriendswa.org` SendGrid sender verification | Tony | ⏳ Pending | First live email campaign |
| GitHub Actions Secrets (8 secrets) | Tony | ⏳ Pending | All GitHub Actions workflows |
| Code push to GitHub | Tony / Claude | ⏳ Pending | Running workflows |
| SerpAPI key (optional) | Tony | Optional | Google search in discovery; seed list works without it |

---

## Scope Change Request Template

When a new requirement or change is requested, document it here before implementing:

```
### Change #XXX — [Title]
**Date:** [Date]
**Type:** [New requirement / Security / Enhancement / Decision / Deferred]
**Initiated by:** [Tony / Claude / External]
**Original:** [What was true before]
**Decision / New requirement:** [What is being added or changed]
**Impact:** [Files affected, behavior change, effort estimate]
**Status:** [Proposed / Approved / Implemented / Deferred]
```

---

*This tracker is a living document. Update at the end of every session.*

---

## CURRENT SESSION OVERRIDE (February 23, 2026)

This section supersedes stale page-status and pending-item notes earlier in this file.

### Scope Decisions Finalized This Session
- Scope expanded to a unified internal fundraising CRM + outreach automation platform (Supabase-backed).
- A full Supabase schema design now exists in `fundraising_app/db/schema.sql`.
- CRM entities added to scope: donors, donations, campaigns, animals, events, communications, reports, stories, team, settings/help content, activity logs, automation progress runs/events.
- Flask backend API now targets this expanded model via `fundraising_app/server.py` + `fundraising_app/db/crm.py` with mock fallback when Supabase is not configured.

### Scope Clarifications
- Frontend page buildout is complete as a UI shell (13 pages exist locally).
- Backend integration is partially complete (API endpoints exist), but deeper page-level data rendering/action wiring remains in progress.
- Email delivery remains in scope, but provider implementation is operationally blocked while SendGrid is inactive and alternatives are being evaluated.

### Previously Pending Items Resolved This Session
- `db/schema.sql` added
- `{{donation_impact}}` token implemented
- 24-hour same-org email send gap enforced (default 24h)
- Discover workflow summary artifact added
- GitHub Actions workflow pathing corrected to repo-root `.github/workflows`
