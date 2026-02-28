# Roadmap (Frontend + Backend)

Last updated: 2026-02-26

## Prioritization Model

- `P0` = required for safe live operation
- `P1` = core business workflow completion
- `P2` = major UX/productivity improvement
- `P3` = polish / optimization

## P0 - Live Readiness / Security

### 1. Production-Grade Authentication and Authorization
- Priority: `P0`
- Frontend scope:
  - Replace localStorage-only account store as source of truth
  - Use backend session state for login/logout/session restore
  - Improve login failure/account state UX (disabled, invited, password reset)
- Backend scope:
  - Persistent user store (not runtime file only)
  - Password hashing (bcrypt/argon2)
  - Persistent session/token store with revocation
  - Full endpoint-by-endpoint role enforcement audit
- Blockers:
  - Final decision on auth provider (custom vs Supabase Auth)
- Risks:
  - Current local account model is not sufficient for production security

### 2. Environment and Secret Management Standardization
- Priority: `P0`
- Frontend scope:
  - Admin diagnostics UI for missing config (optional)
- Backend scope:
  - Production env validation on startup
  - Secret rotation playbook
  - Separate dev/staging/prod configs
- Blockers:
  - Deployment target decision (host/platform)
- Risks:
  - Misconfigured APIs (OpenAI, Google Places, SendGrid, Apollo) causing runtime failures

## P1 - Core Workflow Completion

### 3. Communications Center - Real Outreach Execution
- Priority: `P1`
- Frontend scope:
  - Campaign builder validation and recipient segmentation UX
  - Send progress and outcomes UI
  - Error reporting for failed recipients
- Backend scope:
  - Campaign send pipeline (email/SMS as supported)
  - Delivery status persistence and retries
  - Rate limiting / batching controls
- Blockers:
  - Final provider setup and verified sender identities (SendGrid)
- Risks:
  - Partial sends without clear status can create duplicate outreach

### 4. Donor and Animal Full Profile Workflows
- Priority: `P1`
- Frontend scope:
  - Animal profile page parity with donor/member profile UX
  - Edit/history/note flows across all profile pages
  - Attachment/media support (optional phase)
- Backend scope:
  - Persisted notes/history model standardization
  - Optional file upload storage integration
- Blockers:
  - Final note/history schema design if attachments are included
- Risks:
  - Fragmented profile experience across entities

### 5. Funds Explorer Review + Import Maturation
- Priority: `P1`
- Frontend scope:
  - Bulk review actions for contact rows (approve/reject/classify)
  - Conflict resolution UI (existing org/contact already present)
  - Reviewer notes on import decisions
- Backend scope:
  - Conflict detection metadata in preview/import responses
  - Import transaction/reporting improvements
  - Contact validation scoring refinements
- Blockers:
  - Final import governance rules (overwrite, merge, skip)
- Risks:
  - Low-quality contacts imported without sufficient review controls

### 6. Lead Generation -> Communications -> Campaign Tracking Loop
- Priority: `P1`
- Frontend scope:
  - Full handoff confirmation and segment metadata editing
  - Reopen/edit saved lead lists
- Backend scope:
  - Persisted segments/list objects
  - Campaign attribution to lead sources
- Blockers:
  - Final campaign data model for audience snapshots
- Risks:
  - Hard to reproduce which list was used for a campaign

## P2 - UX / Reporting Enhancements

### 7. Analytics Custom Date Range (TODO)
- Priority: `P2`
- Frontend scope:
  - Custom date picker modal
  - Reload charts/reports by selected range
- Backend scope:
  - Optional filtered analytics endpoints if client filtering is insufficient
- Blockers:
  - Date picker UX choice
- Risks:
  - Users assume analytics is broken when custom range appears selectable but is not

### 8. Impact Reports Backend Generation Pipeline
- Priority: `P2`
- Frontend scope:
  - Progress and download/share UX tied to real generation
- Backend scope:
  - Report generation jobs, file storage, share URLs
- Blockers:
  - Report templates/final output format requirements (PDF/HTML)
- Risks:
  - UI appears functional but reports are placeholder-only

### 9. Page Action Consistency / Global Themed Confirmation Adoption
- Priority: `P2`
- Frontend scope:
  - Replace remaining native `window.confirm()` uses with `FundsApp.confirmDialog`
  - Standardize modal/action patterns across older pages
- Backend scope:
  - None (mostly frontend)
- Blockers:
  - None
- Risks:
  - Inconsistent UX and accidental destructive actions

## P3 - Optimization / Scale / Polish

### 10. Funds Explorer Source Caching and Radius Ring Expansion
- Priority: `P3`
- Frontend scope:
  - Optional cache diagnostics and reset tools
- Backend scope:
  - Google Places tile cache
  - SerpAPI query cache
  - Ring-expansion reuse for larger-radius follow-up searches
- Blockers:
  - Cache persistence decision (DB vs local disk vs Redis)
- Risks:
  - API cost growth and slower repeated searches

### 11. Contact Enrichment Provider Hardening (Apollo)
- Priority: `P3`
- Frontend scope:
  - Provider availability/status messaging
- Backend scope:
  - Apollo permissions/quota handling
  - Provider fallback ranking
- Blockers:
  - Apollo API permissions (current key returns 403)
- Risks:
  - Users expect higher-quality contacts than provider is currently delivering

### 12. Automated QA / Page Interaction Regression Suite
- Priority: `P3`
- Frontend scope:
  - Browser automation smoke for main page actions
- Backend scope:
  - Test fixtures/seeding support
- Blockers:
  - Tooling choice (Playwright/Cypress)
- Risks:
  - Regressions in page interactions after rapid feature changes
