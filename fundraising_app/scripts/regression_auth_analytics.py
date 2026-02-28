"""
Regression checks for auth/session boundaries and analytics custom-range support.

Runs with Flask test client (no network server required).
"""

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _assert(condition: bool, message: str):
    if condition:
        print(f"PASS {message}")
        return 0
    print(f"FAIL {message}")
    return 1


def main() -> int:
    try:
        from fundraising_app import server
    except ModuleNotFoundError:
        import server

    failed = 0

    orig_auth_store_path = server._AUTH_STORE_PATH
    orig_bootstrap_token = server._AUTH_BOOTSTRAP_TOKEN
    orig_crm_client = server.crm._client

    temp_dir = tempfile.TemporaryDirectory()
    try:
        server._AUTH_STORE_PATH = Path(temp_dir.name) / "auth_accounts.json"
        server._AUTH_BOOTSTRAP_TOKEN = "regression-bootstrap-token"
        server.crm._client = lambda: None
        server._AUTH_SESSIONS.clear()
        if server._AUTH_STORE_PATH.exists():
            server._AUTH_STORE_PATH.unlink()

        client = server.app.test_client()

        status_resp = client.get("/api/auth/bootstrap/status")
        status_payload = status_resp.get_json(silent=True) or {}
        failed += _assert(status_resp.status_code == 200, "/api/auth/bootstrap/status responds 200")
        failed += _assert(bool(status_payload.get("needs_bootstrap")), "bootstrap required when auth store is empty")

        bootstrap_resp = client.post(
            "/api/auth/bootstrap/admin",
            json={
                "bootstrap_token": "regression-bootstrap-token",
                "email": "regression-admin@example.org",
                "password": "RegressionPass123",
                "full_name": "Regression Admin",
            },
        )
        failed += _assert(bootstrap_resp.status_code in (200, 201), "bootstrap admin flow succeeds with valid token")

        session_resp = client.get("/api/auth/session")
        session_payload = session_resp.get_json(silent=True) or {}
        session = session_payload.get("session") or {}
        failed += _assert(session_resp.status_code == 200, "/api/auth/session responds 200 after bootstrap")
        failed += _assert(bool(session.get("authenticated")), "session is authenticated after bootstrap")

        donors_unauth = server.app.test_client().get("/api/donors")
        failed += _assert(donors_unauth.status_code == 401, "unauthenticated user blocked from /api/donors")
        campaigns_public = server.app.test_client().get("/api/campaigns")
        failed += _assert(campaigns_public.status_code == 200, "public access remains enabled for /api/campaigns")

        trends_range = client.get("/api/fundraising/trends?range=30")
        trends_custom = client.get("/api/fundraising/trends?start_date=2026-01-01&end_date=2026-01-31")
        failed += _assert(trends_range.status_code == 200, "analytics trends range query succeeds")
        failed += _assert(trends_custom.status_code == 200, "analytics trends custom date query succeeds")

        analytics_js = (ROOT / "fundraising_app" / "frontend" / "js" / "analytics-charts.js").read_text(encoding="utf-8")
        failed += _assert("function buildTrendsUrl()" in analytics_js, "frontend analytics builds trends URL dynamically")
        failed += _assert("analyticsCustomRangeModal" in analytics_js, "frontend analytics custom-range modal is present")
    finally:
        server._AUTH_STORE_PATH = orig_auth_store_path
        server._AUTH_BOOTSTRAP_TOKEN = orig_bootstrap_token
        server.crm._client = orig_crm_client
        temp_dir.cleanup()

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
