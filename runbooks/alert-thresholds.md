# Alert Thresholds (Initial Baseline)

These are initial thresholds and should be tuned with production traffic data.

## Availability

- Trigger alert if `/api/health` non-200 for 3 consecutive checks.
- Trigger alert if 5xx error rate > 2% over 5 minutes.

## Latency

- Trigger warning if p95 API latency > 1200ms over 10 minutes.
- Trigger critical alert if p95 API latency > 2500ms over 5 minutes.

## Authentication

- Trigger warning if `/api/auth/login` failures exceed baseline by 3x for 10 minutes.
- Trigger critical alert if login success rate falls below 80% for 5 minutes.

## Data/Integrity Signals

- Trigger alert if write endpoints return 400/500 spikes > 5% over 10 minutes.
- Trigger alert if donor/team mutation endpoints fail consecutively for 5 minutes.

## Automation and Integrations

- Trigger warning on failed scheduled workflow run.
- Trigger critical if two consecutive scheduled runs fail.

## Runbook Links

- Incident process: `runbooks/incident-response.md`
- On-call execution: `runbooks/oncall-checklist.md`
