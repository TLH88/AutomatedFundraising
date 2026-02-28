# AutomatedFundraising — Progress Tracker
**Project:** Furry Friends Shelter — Fundraiser Lead Gen → Close
**Repo:** https://github.com/TLH88/AutomatedFundraising
**Supabase:** https://kjbbdqqqloljzxikblwa.supabase.co
**Last Updated:** February 22, 2026

---

## 2026-02-28 Remediation Update (Current Session)

### Completed
- Removed legacy default-admin fallback behavior and added first-admin bootstrap flow:
  - `GET /api/auth/bootstrap/status`
  - `POST /api/auth/bootstrap/admin`
- Restricted sensitive APIs to authenticated members:
  - donors, contacts, explorer routes
- Preserved intentionally public page data routes:
  - `/api/animals`, `/api/events`, `/api/campaigns`, `/api/stories`
- Hardened account password policy (8+ chars, uppercase, lowercase, number) across:
  - bootstrap
  - account password change
  - team member create/update auth sync
- Removed weak default password fallback (`Member`) from account provisioning paths.
- Added bootstrap-aware login UX messaging when no admin exists.
- Fixed team disable workflow to use `inactive` status consistently with DB constraints.
- Cleaned runtime auth store of stale demo/legacy accounts; validated real admin login.

### Validation
- `python fundraising_app/scripts/smoke_test_server.py` passing
- `python fundraising_app/scripts/pre_deploy_check.py` passing
- Frontend syntax checks passing (`main.js`, `team.js`, `settings.js`)

### Notes
- Public pages remain intentionally accessible as requested.
- This update is the authoritative state for security remediation work completed on 2026-02-28.
## Status Legend

| Symbol | Meaning |
|---|---|
| ✅ | Complete — built, verified, live |
| 🔄 | Partially complete — functional but has a known gap |
| ⏳ | Pending — not yet started, awaiting action |
| 🚫 | Blocked — waiting on an external dependency |
| ❌ | Identified gap — was planned but not yet addressed |

---

## Pre-Build Decisions

| Decision | Status | Detail |
|---|---|---|
| Fundraiser / org name | ✅ | Furry Friends Shelter |
| Email sending service | ✅ | SendGrid (free tier, 100/day) |
| Email sender identity | ✅ | `Hope from Furry Friends` — `hope@furryfriendswa.org` |
| GitHub repo | ✅ | https://github.com/TLH88/AutomatedFundraising |
| Supabase project | ✅ | AutomatedFundraising — kjbbdqqqloljzxikblwa |
| Geographic scope | ✅ | National (target 200–1,000 orgs) |
| Auth key strategy | ✅ | Supabase publishable key (sb_publishable_...) |
| Supabase service role key | ✅ | Removed — replaced by publishable key |

---

## Phase 1 — Target Research & Discovery

| Item | Status | Detail |
|---|---|---|
| Discovery engine (`scraper/discover.py`) | ✅ | Built and verified |
| Seed org list | ✅ | 25 high-value orgs pre-loaded (PetSmart Charities, Maddie's Fund, Petco Love, Banfield, Hill's, Google.org, etc.) |
| SerpAPI Google search integration | ✅ | 9 search queries defined; runs if `SERPAPI_KEY` is set |
| Petfinder RSS feed integration | ✅ | Pulls up to 50 organizations from Petfinder listings |
| Donation potential scoring (1–10) | ✅ | Applied to all seed orgs; SerpAPI results default to 5 |
| Deduplication by org name | ✅ | Built into discovery run |
| Charity Navigator / GuideStar source | ❌ | Listed in plan; not implemented — both require API keys or auth |
| LinkedIn public org pages | ❌ | Listed in plan; not implemented — scraping requires careful handling; deferred |
| Animal welfare RSS news feeds | 🔄 | Petfinder RSS implemented; additional news RSS feeds not added |
| `scraper/utils.py` (shared helpers) | ✅ | Rate limiting, robots.txt checking, email/phone extraction |

---

## Phase 2 — Contact Extraction

| Item | Status | Detail |
|---|---|---|
| Contact extraction engine (`scraper/extract_contacts.py`) | ✅ | Built and verified |
| Static page scraping (BeautifulSoup4) | ✅ | Handles homepage + up to 6 relevant subpages |
| robots.txt compliance | ✅ | Checked before every fetch via `utils.py` |
| Rate limiting (1.5–3.5s delay) | ✅ | Polite delay between all requests |
| Staff/team page detection | ✅ | Scans for team cards, h3/h4+p patterns, schema.org Person |
| Priority title scoring | ✅ | Ranked by relevance: CEO, Dir. of Giving, VP CSR, Philanthropy, etc. |
| Email extraction (mailto + pattern) | ✅ | Extracts from links and page text |
| Best-email selection logic | ✅ | Prefers giving/csr/philanthropy addresses; avoids noreply/hr/sales |
| Phone extraction | ✅ | Regex-based extraction from page text |
| Playwright fallback (JS-rendered pages) | 🔄 | Integrated inline in `extract_contacts.py`; `playwright_helper.py` as a separate module was planned but not created |
| Email inference from name + domain | ✅ | `guess_contact_emails()` in `utils.py` |
| Confidence scoring (high/medium/low) | ✅ | Applied per contact based on email source quality |
| Justification field population | ✅ | Auto-generated per contact |

---

## Phase 3 — Supabase Database

| Item | Status | Detail |
|---|---|---|
| `organizations` table | ✅ | Live — 9 columns, constraints, triggers |
| `contacts` table | ✅ | Live — 10 columns, FK to organizations |
| `email_campaigns` table | ✅ | Live — 7 columns, status constraint |
| `email_sends` table | ✅ | Live — 8 columns, FK to both tables |
| `updated_at` auto-trigger | ✅ | Applied to all 4 tables via `update_updated_at()` function |
| Index: `contacts(email)` | ✅ | `idx_contact_email` — confirmed live |
| Index: `contacts(org_id)` | ✅ | `idx_contact_org` — confirmed live |
| Index: `email_sends(contact_id, campaign_id)` UNIQUE | ✅ | `idx_unique_send` — prevents duplicate sends |
| Index: `email_sends(campaign_id)` | ✅ | `idx_send_campaign` — confirmed live |
| Index: `email_sends(status)` | ✅ | `idx_send_status` — confirmed live |
| Index: `organizations(donation_potential_score DESC)` | ✅ | `idx_org_score` — confirmed live |
| Index: `organizations(category)` | ✅ | `idx_org_category` — confirmed live |
| RLS enabled on all 4 tables | ✅ | Applied via `security_hardening` migration |
| RLS policies for publishable key (anon role) | ✅ | 11 policies applied via `rls_policies_publishable_key` migration |
| Function search_path hardened | ✅ | `update_updated_at()` fixed — `SET search_path = public` |
| `db/schema.sql` file in repo | ❌ | Listed in planned repo structure; schema was applied via Supabase MCP directly. File not created. Should be added for reproducibility. |
| `db/client.py` database wrapper | ✅ | Built, using publishable key |
| Seed campaign in `email_campaigns` | ✅ | "Cold Outreach — Animal Welfare Donors" — ID: `15ce5c3f-44a9-4f1e-abca-35935fcd810a` |
| Migrations applied | ✅ | 3 migrations: `initial_schema`, `security_hardening`, `rls_policies_publishable_key` |

---

## Phase 4 — Email Campaign System

| Item | Status | Detail |
|---|---|---|
| Token rendering engine (`emailer/render_template.py`) | ✅ | Built — supports 7 tokens |
| `{{contact_name}}` token | ✅ | First name extraction with "Friend" fallback |
| `{{org_name}}` token | ✅ | Organization name |
| `{{org_reason}}` token | ✅ | Justification / notes from org record |
| `{{fundraiser_name}}` token | ✅ | Loaded from env var `FUNDRAISER_NAME` |
| `{{sender_name}}` token | ✅ | Loaded from env var `SENDER_NAME` |
| `{{sender_email}}` token | ✅ | Loaded from env var `SENDER_EMAIL` |
| `{{unsubscribe_link}}` token | ✅ | Unique per contact per send |
| `{{donation_impact}}` token | ❌ | Listed in plan; not implemented in `render_template.py` |
| Cold outreach template | ✅ | `emailer/templates/cold_outreach.txt` — written and seeded in Supabase |
| Follow-up template | ✅ | `emailer/templates/follow_up.txt` — written |
| SendGrid batch send (`emailer/batch_send.py`) | ✅ | Built and verified; 50 emails/batch, 1.5s delay |
| Open tracking | ✅ | SendGrid native open tracking enabled per email |
| Click tracking | ✅ | SendGrid native click tracking enabled per email |
| Unsubscribe flagging | ✅ | `do_not_contact = true` set via `sync_tracking.py` |
| Bounce handling | ✅ | Flags `do_not_contact` on bounce/blocked events |
| Duplicate send prevention | ✅ | `idx_unique_send` enforces one send per contact per campaign |
| Tracking sync (`emailer/sync_tracking.py`) | ✅ | Built — pulls SendGrid events, updates Supabase |
| 24-hour gap between orgs | ❌ | Listed in plan batch processing; not enforced in code |
| Template validation utility | ✅ | `validate_template()` in `render_template.py` |
| SendGrid sender verification | 🚫 | `hope@furryfriendswa.org` must be verified in SendGrid by Tony |

---

## Phase 5 — GitHub Actions Workflows

| Item | Status | Detail |
|---|---|---|
| `discover-and-scrape.yml` | ✅ | Weekly Sunday 6AM + manual trigger |
| `send-campaign.yml` | ✅ | Manual trigger; requires campaign UUID input |
| `sync-tracking.yml` | ✅ | Daily 8AM + manual trigger |
| Summary artifact output (discover workflow) | ❌ | Plan specified "output summary report as Actions artifact" — not yet implemented |
| All workflows use publishable key | ✅ | `SUPABASE_PUBLISHABLE_KEY` confirmed in all 3 workflows |
| Playwright conditional install | ✅ | Only runs if `PLAYWRIGHT_ENABLED=true` |

---

## Repository & Infrastructure

| Item | Status | Detail |
|---|---|---|
| `requirements.txt` | ✅ | All dependencies pinned |
| `.env.example` | ✅ | All vars documented; publishable key pre-filled |
| `.gitignore` | ✅ | `.env`, `__pycache__`, venv, etc. excluded |
| `README.md` | ✅ | Full setup guide, secrets table, workflow docs |
| `scraper/__init__.py` | ✅ | Package marker |
| `emailer/__init__.py` | ✅ | Package marker |
| `db/__init__.py` | ✅ | Package marker |
| All Python files — syntax check (pyflakes) | ✅ | CLEAN — zero errors |
| GitHub Actions Secrets added to repo | ✅ | All 8 secrets added (temp SendGrid values until verification complete) |
| Code pushed to GitHub repo | ✅ | Pushed to https://github.com/TLH88/AutomatedFundraising |
| SerpAPI key configured | ✅ | Key added to GitHub Secrets |

---

## End-to-End Validation

| Item | Status | Detail |
|---|---|---|
| Step 1–8 build sequence | ✅ | All code built and verified locally |
| Live Supabase connection test | ✅ | Tables, indexes, policies all confirmed via MCP |
| End-to-end test run (Step 9) | ⏳ | Ready to run — awaiting user approval to proceed |
| First live scrape run | ⏳ | Ready to run (discovery + contact extraction) — on hold per user request |
| First live email campaign | 🚫 | Blocked: requires SendGrid sender verification |

---

## Phase 6 — Web Dashboard UI

| Page | Status | Detail |
|---|---|---|
| Dashboard (Home) | ✅ | Fundraising trends chart, donations table, impact metrics, news feed |
| Campaigns Page | ⏳ | Campaign list, create/edit, status management |
| Donors Page | 🔄 | In Progress — Donor directory with profiles and history |
| Analytics Page | ⏳ | Custom reports, data visualization, export functionality |
| Impact Reports Page | ⏳ | Generate stakeholder reports with metrics and stories |
| Active Campaigns Detail | ⏳ | Individual campaign deep-dive with performance data |
| Animals Helped Page | ⏳ | Animal profiles, rescue stories, photo gallery |
| Events Calendar | ⏳ | Event management, RSVP tracking, calendar view |
| Communications Center | ⏳ | Email campaign management, message templates |
| Success Stories | ⏳ | Story management, publishing, social sharing |
| Settings Page | ⏳ | App configuration, integrations, preferences |
| Team Management | ⏳ | User roles, permissions, team directory |
| Help & Resources | ⏳ | Documentation, FAQs, support contact |

**Design System:**
- ✅ Design tokens (variables.css)
- ✅ Base styles (base.css)
- ✅ Component library (components.css)
- ✅ Layout system (layout.css)
- ✅ Flask server with mock APIs
- ✅ Chart.js integration
- ✅ Responsive grid (desktop, tablet, mobile)

---

## Open Items Requiring Action

### Tony (External)
- [ ] Verify `hope@furryfriendswa.org` as a SendGrid sender (Settings → Sender Authentication) — **BLOCKING EMAIL CAMPAIGNS**
- [x] Add 8 GitHub Actions Secrets to https://github.com/TLH88/fundraising_app/settings/secrets/actions
- [x] Push codebase to GitHub repo
- [x] Register for SerpAPI key to enable Google search discovery

### Claude (Next Session)

**High Priority — Web UI Page Buildouts (Change #010):**
- [x] **Dashboard Page** — Overview with charts and metrics (COMPLETE)
- [ ] **Donors Page** — Donor directory, profiles, donation history (IN PROGRESS)
- [ ] **Campaigns Page** — Campaign management and creation
- [ ] **Analytics Page** — Deep-dive analytics and reports
- [ ] **Impact Reports Page** — Stakeholder report generation
- [ ] **Active Campaigns Detail** — Individual campaign performance
- [ ] **Animals Helped Page** — Animal profiles and rescue stories
- [ ] **Events Calendar** — Event management and RSVP tracking
- [ ] **Communications Center** — Email campaign management
- [ ] **Success Stories** — Story publishing and management
- [ ] **Settings Page** — App configuration and preferences
- [ ] **Team Management** — User roles and permissions
- [ ] **Help & Resources** — Documentation and support

**High Priority — Backend Integration:**
- [ ] **Connect UI to Supabase** — Replace mock data with real queries
- [ ] **Implement real-time progress updates** (Change #008)
  - Scripts emit progress events during execution
  - 5-second auto-refresh progress display
  - Completion notification
  - Integration with web UI

**Medium Priority — Existing Gaps:**
- [ ] Create `db/schema.sql` file for reproducibility
- [ ] Implement `{{donation_impact}}` token in `render_template.py`
- [ ] Implement 24-hour gap enforcement between sends to same org
- [ ] Add GitHub Actions summary artifact to `discover-and-scrape.yml`

**Low Priority – Optional Enhancements:**
- [ ] Create `scraper/playwright_helper.py` as a separate module (per original plan)
- [ ] Investigate Charity Navigator API or GuideStar alternative for discovery

---

## 2026-02-26 Implementation Update (Codex Session)

### Completed in this session

- [x] Backend auth/session foundation added (`/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, `/api/auth/password`)
- [x] Server-side bearer token enforcement added to key protected APIs (team/progress/import/create/update flows)
- [x] Frontend auth integration now sends bearer token automatically on same-origin `/api/*` requests
- [x] Lead Generation -> Communications handoff workflow implemented (selected leads -> prefilled outreach campaign flow)
- [x] Donor profile backend edit + note creation workflows added (`PUT /api/donors/:id`, `GET/POST /api/donors/:id/notes`)
- [x] Animal backend detail/edit/delete + note workflows added (`GET/PUT/DELETE /api/animals/:id`, `GET/POST /api/animals/:id/notes`)
- [x] Funds Explorer review/import UX refinement (result-type review filters, contact validation summary, low-quality contact import gating)
- [x] Smoke tests updated for backend auth and protected endpoints

### Open / Unfinished / TODO (current)

- [ ] Analytics custom date range UX remains TODO (`frontend/js/analytics-charts.js`)
  - [ ] Show custom date picker modal
  - [ ] Reload analytics data for selected custom range
- [ ] Backend auth is implemented, but frontend account/role store is still localStorage-based (not a full production auth stack)
  - [ ] Migrate local account records/roles to backend persistence
  - [ ] Add secure password hashing + persistent session storage
  - [ ] Enforce backend role authorization on all remaining APIs (audit pass still needed)
- [ ] Donor/Animal workflows are improved but still need deeper backend-backed profile experiences
  - [ ] Animal profile page (full-page profile parity with donor/member profiles)
  - [ ] Persist richer notes/history/attachments where applicable
- [ ] Funds Explorer import/contact review needs further refinement
  - [ ] Bulk classification/review actions for contact rows
  - [ ] Conflict handling UI when import collides with existing records
  - [ ] Stronger contact validation heuristics and reviewer override flow
- [ ] Page-by-page interactive audit still needs periodic reruns after new feature additions

### Verification notes (this session)

- [x] Python compile checks passed for core backend/scraper modules
- [x] Frontend JS syntax checks passed for edited scripts (`main`, `team`, `settings`, `funds-explorer`, `communications`, `animals`, `donor-profile`, `lead-generation`)
- [x] Backend smoke test passed with auth-enabled flow (`fundraising_app/scripts/smoke_test_server.py`)
- [x] Route checks passed (`200`) for all primary pages except `help.html` (intentionally excluded from action audit scope)

---

---

## Current Status — Ready to Test

**✅ COMPLETE:**
- All code written, tested, and pushed to GitHub
- All GitHub Actions Secrets configured
- SerpAPI key active for enhanced discovery

**🚫 BLOCKING EMAIL SENDS:**
- SendGrid sender verification pending (will complete later)

**⏳ READY TO RUN (on hold per user request):**
- Discovery & Scrape workflow can run immediately (does NOT require SendGrid)
- Will populate database with organizations and contacts
- Safe to test without affecting any email sending

---

*Last full audit: February 22, 2026 | 19 code files | 3 Supabase migrations | 11 RLS policies | 7 indexes*

---

## CURRENT SESSION OVERRIDE (February 23, 2026)

This section is the authoritative status snapshot for the current codebase.

### Major Status Changes This Session
- Web dashboard UI page buildout: COMPLETE (13-page frontend exists locally).
- Backend integration: PARTIAL (Supabase-aware Flask API implemented with mock fallback).
- Supabase CRM schema design: COMPLETE (`fundraising_app/db/schema.sql`).
- GitHub workflow location/pathing: FIXED (moved to repo-root `.github/workflows`, working directory set to `AutomatedFundraising`).
- Discover workflow artifact summary: IMPLEMENTED.
- `{{donation_impact}}` token: IMPLEMENTED.
- 24-hour same-org send gap: IMPLEMENTED in `emailer/batch_send.py` using recent org send checks.

### SendGrid / Email Delivery Status (Updated)
- SendGrid account is currently inactive.
- Live outbound email sending and tracking sync validation are blocked pending provider reactivation or provider replacement.
- Connection checks now treat missing `SENDGRID_API_KEY` as non-fatal while provider is under review.

### Frontend + Backend Milestones (Normal SDLC Tracking)
- Milestone F1: UI page buildout (HTML/CSS/JS) - COMPLETE
- Milestone B1: Flask API server with mock endpoints - COMPLETE
- Milestone B2: Supabase-aware CRM API layer (`db/crm.py`) - COMPLETE
- Milestone B3: Unified Supabase schema design (`db/schema.sql`) - COMPLETE (design only; not yet applied in Supabase)
- Milestone B4: Page-by-page frontend wiring to live API responses - IN PROGRESS
- Milestone B5: Real-time automation progress UX (5s updates) - PARTIAL (schema/API scaffolding via `automation_runs` + `automation_run_events`; UI wiring pending)
- Milestone O1: Workflow execution from repo root - COMPLETE (pathing fixed)
- Milestone O2: Email provider migration/selection - PENDING

### Validation / Smoke Tests Added This Session
- `fundraising_app/scripts/smoke_test_server.py` (Flask API smoke tests)
- `fundraising_app/scripts/pre_deploy_check.py` (compile, imports, smoke tests, optional connection checks)
- Local smoke tests passed in mock mode on February 23, 2026

### Pre-Deployment Check Gate (Use Before Push/Deploy)
1. Run `python fundraising_app/scripts/pre_deploy_check.py`
2. If using Supabase, run `python fundraising_app/scripts/test_connections.py`
3. If email provider is active, validate send/tracking scripts against non-production data first
4. Confirm workflow files exist in repo-root `.github/workflows`
5. Confirm tracker/docs updates for the session are committed with code changes
