# Page-by-Page Checklist Matrix (Audit Pass)

Last updated: 2026-02-26

## Audit scope and method

This matrix reflects a code + route + smoke-test audit with targeted runtime checks. It is not a full human click-through of every control in a browser session.

Completed for this pass:
- Route checks (`200`) for all pages below
- Frontend JS syntax checks for edited scripts
- Backend smoke tests (`fundraising_app/scripts/smoke_test_server.py`)
- Static sweep for obvious dead-control patterns (`TODO`, `alert`, placeholder links)

Excluded by request:
- `help.html`

## Status legend

- `PASS` = Page loads and core actions are wired to a real handler/workflow
- `PARTIAL` = Page functions, but one or more major workflows are still placeholder/limited
- `REVIEW` = Needs deeper manual regression test after recent changes

## Matrix

| Page | Route | Primary Actions | Status | Notes / Gaps |
|---|---|---|---|---|
| `landing.html` | `/` / `/landing.html` | Public nav, sign-in, dashboard access CTAs | PASS | Hero/background and theme-aware controls present |
| `index.html` | `/index.html` | Dashboard widgets, donation entry modal, filters | REVIEW | Core flows wired; continue manual regression after auth changes |
| `campaigns.html` | `/campaigns.html` | Create/edit/view/analytics/delete campaign | PASS | Modal actions wired; progress display fixed |
| `donors.html` | `/donors.html` | Filter/search, donor profile modal, contact actions | PASS | Visitor donation-history privacy controls implemented |
| `donor-profile.html` | `/donor-profile.html` | Load profile, edit donor, add note, contact actions | PARTIAL | Main edit/note flows added; deeper profile actions still limited |
| `funds-explorer.html` | `/funds-explorer.html` | Discovery search, review filters, preview, import | PASS | Review/import refinement added (contact validation + low-quality skip) |
| `lead-generation.html` | `/lead-generation.html` | Filter leads, select/export/copy, handoff to Communications | PASS | Handoff to Communications implemented |
| `analytics.html` | `/analytics.html` | Range filters/charts/report widgets | PARTIAL | Charts render; custom date range workflow still TODO |
| `animals.html` | `/animals.html` | View/edit/add/delete animals, notes, export | PARTIAL | Backend CRUD/note wiring added for API-backed rows; no dedicated animal profile page yet |
| `events.html` | `/events.html` | Event listing/filters/actions | PARTIAL | Page functions, but deeper backend event workflows still limited |
| `communications.html` | `/communications.html` | Campaign create/send flows, lead handoff prefill | PARTIAL | Lead handoff + draft creation work; full send pipeline still evolving |
| `stories.html` | `/stories.html` | Story list/cards and actions | PARTIAL | Core UI actions present; deeper publish/edit workflow still limited |
| `impact-reports.html` | `/impact-reports.html` | Preview/download/share/publish actions | PARTIAL | Actions have handlers; backend report generation pipeline still needed |
| `settings.html` | `/settings.html` | Navigator, branding/theme, permissions, password/admin settings | PASS | Page permissions + settings navigator implemented |
| `team.html` | `/team.html` | Member create/invite/disable/re-enable/requests | PASS | Admin/member visibility and request approval flows wired |
| `member-profile.html` | `/member-profile.html` | View/edit profile, role-aware display, avatar/photo | PASS | Modern layout + role color accents + permission-sensitive editing |
| `help.html` | `/help.html` | Help resources | EXCLUDED | Excluded from this audit per request |

## Key cross-page findings

### Implemented and functional in this pass
- Backend auth/session API and protected endpoint enforcement (core routes)
- Donor/animal backend CRUD+note endpoints and frontend usage in key pages
- Lead Generation -> Communications handoff
- Funds Explorer review/import refinements
- Global page permissions controlling nav visibility

### Still missing / needs buildout (high-level)
- Production-grade auth persistence/hashing (current backend auth is a working foundation, not final security model)
- Full Communications send/delivery pipeline
- Animal full-page profile parity and richer history/media support
- Analytics custom date range UI flow
- Impact report real generation/download pipeline

## Recommended manual regression test order (next)

1. `settings.html` (permissions + branding)
2. `team.html` + `member-profile.html`
3. `donors.html` + `donor-profile.html`
4. `campaigns.html`
5. `funds-explorer.html` -> import -> `lead-generation.html` -> `communications.html`
6. `index.html`
