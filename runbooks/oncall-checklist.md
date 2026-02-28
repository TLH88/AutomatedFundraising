# On-Call Checklist

## Shift Start

1. Confirm access to deployment platform, logs, and database dashboards.
2. Verify latest successful CI run on default branch.
3. Check open incidents and unresolved alerts.
4. Confirm `pre_deploy_check.py` and smoke baseline from last release are green.
5. Verify auth bootstrap is disabled in production (`needs_bootstrap=false`).

## During Incident

1. Create/update incident channel and assign incident commander.
2. Capture start time, suspected scope, and user impact.
3. Triage severity using `incident-response.md`.
4. Apply mitigations with smallest safe blast radius first.
5. Record timeline entries for all major actions and decisions.

## Shift End

1. Hand off active alerts/incidents with current state and next action.
2. Link all incident artifacts (logs, query snapshots, timeline).
3. File follow-up tasks for root cause, tests, and runbook updates.
