# Incident Response

## Severity Levels

- `Sev-1`: Complete outage, auth failure for most users, or data integrity risk.
- `Sev-2`: Major feature degraded for many users, no confirmed data corruption.
- `Sev-3`: Partial degradation or non-critical function impacted.

## Response Targets

- `Sev-1`: Acknowledge within 5 minutes, mitigation target within 30 minutes.
- `Sev-2`: Acknowledge within 15 minutes, mitigation target within 2 hours.
- `Sev-3`: Acknowledge within business day, mitigation target within 2 business days.

## Process

1. Detect and classify severity.
2. Assign Incident Commander and communications owner.
3. Stabilize service:
   - rollback recent deployment if indicated
   - disable risky write paths if needed
   - preserve forensic data before destructive actions
4. Communicate:
   - internal updates every 15 minutes for Sev-1/Sev-2
   - external status updates as appropriate
5. Resolve and verify:
   - rerun smoke + regression checks
   - validate auth/session and protected endpoint behavior
6. Close with post-incident review:
   - root cause
   - preventive actions
   - owner and due date for each action

## Evidence to Collect

- Deployment identifiers and timestamps
- Relevant API error rates and response codes
- Authentication/session logs (redacted)
- Database query errors and latency spikes
- Timeline of mitigations and observed effects
