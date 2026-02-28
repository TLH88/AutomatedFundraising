# Webapp Production Readiness Review Results


## 2026-02-28 Update (Authoritative Current Snapshot)

This section supersedes conflicting claims below that were true on 2026-02-27 but are no longer accurate.

### Resolved Since Prior Review
- Security headers are now set in Flask responses (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; HSTS on secure requests).
- CORS is no longer wildcard; explicit allowlist is configured via `CORS_ALLOWED_ORIGINS`.
- Write-path rate limiting and login throttling are present.
- Legacy hardcoded default-admin fallback behavior has been removed from active auth logic.
- First-admin setup is now explicit via bootstrap endpoints:
  - `GET /api/auth/bootstrap/status`
  - `POST /api/auth/bootstrap/admin` (guarded by `AUTH_BOOTSTRAP_TOKEN`, only when no active admin exists)
- Sensitive APIs were tightened:
  - `/api/donors*`, `/api/contacts`, and `/api/explorer/*` now require authenticated member access.
  - Public-facing page APIs (`/api/animals`, `/api/events`, `/api/campaigns`, `/api/stories`) remain intentionally public by design.
- Team disable/reenable flow was fixed to use `inactive` status consistently with DB constraints.
- Team/account password policy was strengthened:
  - minimum 8 chars, includes uppercase, lowercase, and number.
  - weak default password fallback (`Member`) removed.
- Smoke/pre-deploy checks were updated and are currently passing.

### Still Open / Remaining Production Gaps
- Frontend still persists some auth/session-related and account-management state in browser storage.
- No comprehensive automated test suite coverage baseline (unit/integration/e2e) is enforced yet.
- Observability and incident-response posture remains limited (no centralized alerting/runbook package in repo).
- Compliance/legal controls (privacy policy/TOS/cookie controls and formal process evidence) require external/legal validation.

### Current Decision
- Launch readiness remains **not production-ready** due to governance/testing/compliance gaps, but several previously reported critical technical blockers are now remediated.

Date: 2026-02-27  
Reviewer: Codex (automated code/runtime audit)

## Scope and Method
- Source audit across backend/frontend/scraper/db/schema/workflows/docs.
- Runtime checks against local server (`/api/health`, auth flow, CRUD smoke checks).
- Security/header/auth/storage/secret scans.
- Checklist controls marked as:
  - `Pass`: confirmed in code/runtime
  - `Fail`: confirmed missing or unsafe
  - `Needs External Verification`: cannot be validated from local repo/runtime only

## Executive Summary
- Overall readiness: **Not production-ready yet**.
- Primary blockers are **security hardening** and **governance controls**, not core feature functionality.
- Core app flows are mostly functional, but several controls in domains 2/3/5/6/7/9/10 are missing.

## Critical Findings (Blockers)
1. **Secrets exposure risk (Critical)**
   - Live keys are present in `AutomatedFundraisingProjNotes.txt` and file is tracked by git.
   - Evidence: key patterns detected (`AIza`, `sk-...`).
2. **Client-side sensitive storage (Critical)**
   - Auth token is stored in `localStorage` (`funds_backend_auth_token`).
   - Signup requests store plaintext passwords in `localStorage` (`funds_signup_requests`).
3. **API security headers missing (Critical)**
   - No CSP, HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options in responses.
4. **CORS overly permissive (Critical)**
   - `CORS(app)` default behavior exposes `Access-Control-Allow-Origin: *`.
5. **No brute-force/rate-limit protections (Critical)**
   - No login rate limiting, no lockout, no API throttling.
6. **Development RLS policies are permissive (Critical)**
   - Schema creates `anon` read/write policies with `using (true) with check (true)` for many tables.
7. **Hardcoded fallback admin pattern remains risky (Critical)**
   - Local default admin account is enforced by app logic.

## Domain Results

### 1. Code Quality & Architecture
- Pass:
  - Consistent high-level structure (`frontend/`, `db/`, `scraper/`, `emailer/`, `scripts/`).
  - Dependencies declared in `fundraising_app/requirements.txt` and pinned.
- Fail:
  - No linter/formatter configuration files detected.
  - TODOs remain in code (`frontend/js/analytics-charts.js`).
  - Minimal API/function documentation and sparse inline explanation in complex areas.
- Status: **Partial / Fail**

### 2. Security Hardening
- Pass:
  - Password hashing uses Werkzeug adaptive hash (scrypt format) in backend auth store.
  - Server-side authorization checks exist for many write endpoints.
- Fail:
  - Missing MFA, lockout, rate limiting, CSRF protections.
  - Missing security headers.
  - CORS wildcard.
  - Client-side storage of token and plaintext signup passwords.
  - Default admin fallback credentials pattern.
- Status: **Fail (Blocker)**

### 3. Testing & QA
- Pass:
  - `pre_deploy_check.py` and API smoke tests run successfully.
- Fail:
  - No robust unit/integration/E2E test suite with measured coverage.
  - No SAST/DAST tooling integrated in CI.
  - No documented load/stress/Core Web Vitals testing.
- Status: **Fail**

### 4. Database & Data Management
- Pass:
  - PK/FK/constraints present in schema.
  - Migration files exist.
  - RLS enabled.
- Fail:
  - RLS policies are intentionally broad for anon role (development-safe only).
- Needs External Verification:
  - Backup retention, PITR, DR drills, RTO/RPO.
- Status: **Partial / Fail for production due to permissive policies**

### 5. Infrastructure & Deployment
- Pass:
  - GitHub Actions workflows exist for discovery/send/sync jobs.
- Fail:
  - No visible CI quality gate for lint/tests/security scan before merge.
  - No explicit immutable artifact/rollback strategy in repo automation.
- Needs External Verification:
  - IAM least-privilege, WAF, network segmentation, autoscaling, CDN, container hardening.
- Status: **Partial**

### 6. Observability & Incident Response
- Pass:
  - Basic logging exists.
- Fail:
  - No structured JSON logs standard.
  - No centralized logging/alerting/on-call integration evident in repo.
  - No incident runbooks in repo for operational events.
- Status: **Fail / Partial**

### 7. Compliance, Privacy & Legal
- Fail:
  - No verified privacy policy/TOS/cookie consent implementation in codebase.
  - No evidence of formal GDPR/CCPA workflow implementation.
- Needs External Verification:
  - Legal reviews and breach-notification process.
- Status: **Fail / External required**

### 8. Documentation & Knowledge Management
- Pass:
  - `README` and operational docs exist (`livelaunchreqs.md`, `roadmap.md`, trackers).
- Fail:
  - API docs (OpenAPI/Swagger) not present.
  - ADRs not present.
  - Full env var catalog appears incomplete for security/ops needs.
- Status: **Partial**

### 9. Frontend & UX
- Pass:
  - Loading/error states implemented in key async workflows.
  - Responsive/theming work appears broadly implemented.
- Fail:
  - Sensitive token/password data stored in browser storage.
  - No verified CSRF strategy for state-changing requests.
  - SRI not evident for external assets.
- Needs External Verification:
  - Formal WCAG 2.1 AA accessibility audit across all views.
- Status: **Fail / Partial**

### 10. Final Pre-Launch Review
- Pass:
  - Basic smoke checks pass locally.
- Fail:
  - Security sign-off not ready.
  - Several high-severity controls incomplete.
- Needs External Verification:
  - DNS/SSL/email deliverability/production monitoring/quotas in live environment.
- Status: **Fail (not launch-ready)**

## Key Evidence Collected
- `python fundraising_app/scripts/pre_deploy_check.py` -> PASS (compile/import/smoke checks).
- Runtime header check on `/api/health`:
  - CSP/HSTS/XFO/Referrer-Policy/X-Content-Type-Options = missing.
  - `Access-Control-Allow-Origin: *`.
- Auth response:
  - token returned in JSON body; no secure HttpOnly cookie.
- Secrets scan:
  - Live key patterns present in `AutomatedFundraisingProjNotes.txt`.
- Schema review:
  - `schema.sql` anon RLS policies allow all operations (`using (true)` / `with check (true)`).

## Prioritized Remediation Plan
1. **Secrets emergency response**
   - Rotate all exposed keys immediately (Google/OpenAI/Supabase/etc.).
   - Remove secrets from tracked files and git history.
2. **Auth/session hardening**
   - Move auth token to secure, HttpOnly, SameSite cookies.
   - Remove plaintext password storage from frontend signup flow.
3. **Add baseline API hardening**
   - Add strict CORS origin allowlist.
   - Add security headers middleware.
   - Add rate limiting + login throttling + lockout.
4. **Replace permissive anon RLS policies**
   - Implement role-based policies (`anon` read-only limited, authenticated/member/admin scoped writes).
5. **CSRF protection for state-changing endpoints**
   - SameSite cookie + CSRF token strategy.
6. **Quality gates**
   - Add lint/format/test/security scan in CI required checks.
7. **Testing baseline**
   - Add unit tests for auth, permissions, and data mappers.
   - Add integration tests for key CRUD and permission boundaries.
8. **Operational readiness**
   - Add structured logging, centralized log shipping, and basic alerting.

## Final Decision
- **Checklist outcome: FAIL for production launch at this time.**
- The app should continue in controlled dev/staging use until security blockers are remediated.
