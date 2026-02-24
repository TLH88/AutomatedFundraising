"""
Basic smoke tests for the Flask dashboard API.

Runs with the Flask test client (no network server required).
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    try:
        from fundraising_app.server import app
    except ModuleNotFoundError:
        from server import app

    client = app.test_client()
    checks = [
        ("/api/health", 200),
        ("/api/fundraising/trends", 200),
        ("/api/fundraising/total", 200),
        ("/api/donors", 200),
        ("/api/campaigns", 200),
        ("/api/animals", 200),
        ("/api/events", 200),
        ("/api/stories", 200),
        ("/api/reports", 200),
        ("/api/team", 200),
        ("/api/progress/runs", 200),
    ]

    failed = 0
    for path, expected in checks:
        resp = client.get(path)
        ok = resp.status_code == expected
        print(f"{'PASS' if ok else 'FAIL'} {path} -> {resp.status_code}")
        if not ok:
            failed += 1

    create_checks = [
        ("/api/donations", {"amount": 25, "donation_type": "one-time", "source": "manual"}),
        ("/api/donors", {"full_name": "Smoke Donor", "email": "donor-smoke@example.org", "tier": "friend"}),
        ("/api/campaigns", {"name": "Smoke Campaign", "goal": 5000}),
        ("/api/animals", {"name": "Smoke Animal", "species": "dog"}),
        ("/api/events", {"name": "Smoke Event", "type": "fundraiser"}),
        ("/api/stories", {"title": "Smoke Story"}),
        ("/api/reports/generate", {"title": "Smoke Report", "type": "monthly"}),
        ("/api/team", {"name": "Smoke User", "email": "smoke@example.org"}),
        ("/api/progress/runs", {"run_type": "discover", "status": "queued"}),
    ]
    for path, payload in create_checks:
        resp = client.post(path, json=payload)
        ok = resp.status_code in (200, 201)
        print(f"{'PASS' if ok else 'FAIL'} POST {path} -> {resp.status_code}")
        if not ok:
            failed += 1

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
