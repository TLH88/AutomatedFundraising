import tempfile
import unittest
from pathlib import Path

from fundraising_app import server


class AuthPermissionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._orig_auth_store_path = server._AUTH_STORE_PATH
        cls._orig_bootstrap_token = server._AUTH_BOOTSTRAP_TOKEN
        cls._orig_crm_client = server.crm._client
        cls._temp_dir = tempfile.TemporaryDirectory()
        server._AUTH_STORE_PATH = Path(cls._temp_dir.name) / "auth_accounts.json"
        server._AUTH_BOOTSTRAP_TOKEN = "test-bootstrap-token"
        server.crm._client = lambda: None

    @classmethod
    def tearDownClass(cls):
        server._AUTH_STORE_PATH = cls._orig_auth_store_path
        server._AUTH_BOOTSTRAP_TOKEN = cls._orig_bootstrap_token
        server.crm._client = cls._orig_crm_client
        cls._temp_dir.cleanup()

    def setUp(self):
        server._AUTH_SESSIONS.clear()
        if server._AUTH_STORE_PATH.exists():
            server._AUTH_STORE_PATH.unlink()
        self.client = server.app.test_client()

    def _login(self, email: str, password: str):
        return self.client.post("/api/auth/login", json={"email": email, "password": password})

    def test_bootstrap_status_reports_needed_when_empty(self):
        resp = self.client.get("/api/auth/bootstrap/status")
        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json() or {}
        self.assertTrue(payload.get("needs_bootstrap"))
        self.assertTrue(payload.get("bootstrap_token_configured"))

    def test_bootstrap_rejects_invalid_token(self):
        resp = self.client.post(
            "/api/auth/bootstrap/admin",
            json={
                "bootstrap_token": "bad-token",
                "email": "admin@example.org",
                "password": "StrongPass123",
                "full_name": "Admin User",
            },
        )
        self.assertEqual(resp.status_code, 403)

    def test_bootstrap_and_session_authentication_flow(self):
        resp = self.client.post(
            "/api/auth/bootstrap/admin",
            json={
                "bootstrap_token": "test-bootstrap-token",
                "email": "admin@example.org",
                "password": "StrongPass123",
                "full_name": "Admin User",
            },
        )
        self.assertIn(resp.status_code, (200, 201))

        session_resp = self.client.get("/api/auth/session")
        self.assertEqual(session_resp.status_code, 200)
        payload = session_resp.get_json() or {}
        session = payload.get("session") or {}
        self.assertTrue(session.get("authenticated"))
        self.assertEqual((session.get("user") or {}).get("role"), "administrator")

    def test_permission_boundaries_public_member_and_admin_paths(self):
        public_resp = self.client.get("/api/campaigns")
        self.assertEqual(public_resp.status_code, 200)

        protected_resp = self.client.get("/api/donors")
        self.assertEqual(protected_resp.status_code, 401)

        server._upsert_auth_account(
            {
                "email": "viewer@example.org",
                "full_name": "Viewer User",
                "role": "visitor",
                "status": "active",
                "password": "ViewerPass123",
            }
        )
        viewer_client = server.app.test_client()
        login_resp = viewer_client.post(
            "/api/auth/login",
            json={"email": "viewer@example.org", "password": "ViewerPass123"},
        )
        self.assertEqual(login_resp.status_code, 200)
        viewer_team_resp = viewer_client.get("/api/team")
        self.assertEqual(viewer_team_resp.status_code, 401)

        server._upsert_auth_account(
            {
                "email": "member@example.org",
                "full_name": "Member User",
                "role": "member",
                "status": "active",
                "password": "MemberPass123",
            }
        )
        member_client = server.app.test_client()
        member_login = member_client.post(
            "/api/auth/login",
            json={"email": "member@example.org", "password": "MemberPass123"},
        )
        self.assertEqual(member_login.status_code, 200)
        member_team_resp = member_client.get("/api/team")
        self.assertEqual(member_team_resp.status_code, 200)

    def test_fundraising_trends_range_and_custom_date_filters(self):
        range_resp = self.client.get("/api/fundraising/trends?range=30")
        self.assertEqual(range_resp.status_code, 200)
        range_payload = range_resp.get_json() or {}
        self.assertIsInstance(range_payload.get("labels"), list)

        custom_resp = self.client.get("/api/fundraising/trends?start_date=2026-01-01&end_date=2026-01-31")
        self.assertEqual(custom_resp.status_code, 200)
        custom_payload = custom_resp.get_json() or {}
        self.assertIsInstance(custom_payload.get("labels"), list)
        self.assertIsInstance(custom_payload.get("values"), list)


if __name__ == "__main__":
    unittest.main(verbosity=2)
