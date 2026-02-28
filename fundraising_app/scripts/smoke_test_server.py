"""
Basic smoke tests for the Flask dashboard API.

Runs with the Flask test client (no network server required).
"""

import sys
import time
import os
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _env_enabled(name: str) -> bool:
    return str(os.environ.get(name, "")).strip().lower() in {"1", "true", "yes", "on"}


def _load_local_app():
    app_dir = str((ROOT / "fundraising_app").resolve())
    server_path = str((ROOT / "fundraising_app" / "server.py").resolve())
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
    # Execute the local server file directly to avoid any module-resolution ambiguity in CI.
    namespace = runpy.run_path(server_path)
    app = namespace.get("app")
    if app is None:
        raise RuntimeError("Flask app object not found in local server module")
    return app


def main() -> int:
    app = _load_local_app()

    client = app.test_client()
    auth_email = str(os.environ.get("SMOKE_TEST_AUTH_EMAIL") or "").strip().lower()
    auth_password = str(os.environ.get("SMOKE_TEST_AUTH_PASSWORD") or "").strip()
    if not auth_email:
        auth_email = "admin@admin.local"
    if not auth_password:
        auth_password = "admin"
    auth_token = None
    login_resp = client.post("/api/auth/login", json={"email": auth_email, "password": auth_password})
    if login_resp.status_code != 200:
        status_resp = client.get("/api/auth/bootstrap/status")
        status_payload = status_resp.get_json(silent=True) or {}
        needs_bootstrap = bool((status_payload.get("needs_bootstrap") if isinstance(status_payload, dict) else False))
        if needs_bootstrap:
            bootstrap_token = str(os.environ.get("AUTH_BOOTSTRAP_TOKEN") or "").strip()
            if bootstrap_token:
                bootstrap_email = str(os.environ.get("SMOKE_TEST_BOOTSTRAP_EMAIL") or auth_email or "smoke-admin@example.org").strip().lower()
                bootstrap_password = str(os.environ.get("SMOKE_TEST_BOOTSTRAP_PASSWORD") or auth_password or "").strip()
                if len(bootstrap_password) < 8:
                    bootstrap_password = "SmokeAdminPass123!"
                bootstrap_resp = client.post(
                    "/api/auth/bootstrap/admin",
                    json={
                        "bootstrap_token": bootstrap_token,
                        "email": bootstrap_email,
                        "password": bootstrap_password,
                        "full_name": "Smoke Test Administrator",
                    },
                )
                if bootstrap_resp.status_code in (200, 201):
                    auth_email = bootstrap_email
                    auth_password = bootstrap_password
                    login_resp = client.post("/api/auth/login", json={"email": auth_email, "password": auth_password})
    if login_resp.status_code == 200:
        auth_token = (login_resp.get_json(silent=True) or {}).get("token")
    else:
        print(f"FAIL /api/auth/login -> {login_resp.status_code}")
        return 1
    auth_headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
    checks = [
        ("/api/health", 200, False),
        ("/api/auth/session", 200, True),
        ("/api/fundraising/trends", 200, True),
        ("/api/fundraising/total", 200, True),
        ("/api/donors", 200, True),
        ("/api/campaigns", 200, False),
        ("/api/animals", 200, False),
        ("/api/events", 200, False),
        ("/api/stories", 200, False),
        ("/api/reports", 200, True),
        ("/api/explorer/organizations", 200, True),
        ("/api/team", 200, True),
        ("/api/progress/runs", 200, True),
    ]

    failed = 0
    for path, expected, needs_auth in checks:
        resp = client.get(path, headers=auth_headers if needs_auth else None)
        ok = resp.status_code == expected
        print(f"{'PASS' if ok else 'FAIL'} {path} -> {resp.status_code}")
        if not ok:
            failed += 1

    # Explorer detail smoke: only if at least one organization is available.
    explorer_resp = client.get("/api/explorer/organizations?limit=1", headers=auth_headers)
    if explorer_resp.status_code == 200:
        payload = explorer_resp.get_json(silent=True) or {}
        orgs = payload.get("organizations") or []
        if orgs and orgs[0].get("id"):
            org_id = orgs[0]["id"]
            detail_resp = client.get(f"/api/explorer/organizations/{org_id}")
            ok = detail_resp.status_code == 200
            print(f"{'PASS' if ok else 'FAIL'} /api/explorer/organizations/{org_id} -> {detail_resp.status_code}")
            if not ok:
                failed += 1
        else:
            print("PASS /api/explorer/organizations/<id> -> skipped (no organizations available)")
    else:
        print(f"FAIL /api/explorer/organizations?limit=1 precheck -> {explorer_resp.status_code}")
        failed += 1

    if _env_enabled("SMOKE_TEST_ENABLE_WRITE_CHECKS"):
        create_checks = [
            ("/api/donations", {"amount": 25, "donation_type": "one-time", "source": "manual"}),
            (
                "/api/donors",
                {
                    "full_name": "Smoke Donor",
                    "email": f"donor-smoke-{int(time.time() * 1000)}@example.org",
                    "tier": "friend",
                },
            ),
            ("/api/campaigns", {"name": "Smoke Campaign", "goal": 5000}),
            ("/api/animals", {"name": "Smoke Animal", "species": "dog"}),
            ("/api/events", {"name": "Smoke Event", "type": "fundraiser"}),
            ("/api/stories", {"title": "Smoke Story"}),
            ("/api/reports/generate", {"title": "Smoke Report", "type": "monthly"}),
            (
                "/api/team",
                {
                    "name": "Smoke User",
                    "email": f"smoke-{int(time.time() * 1000)}@example.org",
                    "password": "SmokePass123",
                },
            ),
            ("/api/progress/runs", {"run_type": "discover", "status": "queued"}),
        ]
        for path, payload in create_checks:
            resp = client.post(path, json=payload, headers=auth_headers)
            ok = resp.status_code in (200, 201)
            print(f"{'PASS' if ok else 'FAIL'} POST {path} -> {resp.status_code}")
            if not ok:
                failed += 1
    else:
        print("SKIP write/create endpoint checks (set SMOKE_TEST_ENABLE_WRITE_CHECKS=true to enable)")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
