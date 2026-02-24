"""
Funds 4 Furry Friends dashboard development server.

- Serves static frontend files
- Exposes JSON API endpoints for the expanded CRM dashboard
- Uses Supabase when configured, otherwise falls back to mock data
"""

from __future__ import annotations

import io
import sys
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Load local app env file for both `python server.py` and package imports.
load_dotenv(Path(__file__).resolve().parent / ".env")

try:
    from db import crm  # when running `python server.py` from fundraising_app/
except ModuleNotFoundError:  # pragma: no cover - import fallback
    from .db import crm  # when importing as `fundraising_app.server`

app = Flask(__name__, static_folder="frontend")
CORS(app)


def _json_ok(payload: dict, status: int = 200):
    payload.setdefault("meta", {})
    payload["meta"].update(
        {
            "data_source": crm.data_source(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    return jsonify(payload), status


def _json_error(message: str, status: int = 400):
    return jsonify({"error": message, "meta": {"data_source": crm.data_source()}}), status


@app.route("/")
def serve_dashboard():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static(path: str):
    return send_from_directory(app.static_folder, path)


# ---------------------------------------------------------------------------
# Dashboard endpoints
# ---------------------------------------------------------------------------


@app.route("/api/fundraising/trends")
def fundraising_trends():
    return _json_ok(crm.get_fundraising_trends())


@app.route("/api/fundraising/total")
def fundraising_total():
    return _json_ok(crm.get_fundraising_total())


@app.route("/api/donations/recent")
def recent_donations():
    limit = int(request.args.get("limit", 10))
    return _json_ok(crm.get_recent_donations(limit=limit))


@app.route("/api/donations", methods=["POST"])
def create_donation():
    payload = request.get_json(silent=True) or {}
    created = crm.create_donation(payload)
    return _json_ok({"donation": created}, status=201)


@app.route("/api/campaigns/active")
def active_campaigns():
    return _json_ok(crm.get_active_campaigns())


@app.route("/api/impact/monthly")
def monthly_impact():
    return _json_ok(crm.get_monthly_impact())


@app.route("/api/stats/overview")
def stats_overview():
    return _json_ok(crm.get_stats_overview())


@app.route("/api/updates/recent")
def recent_updates():
    return _json_ok(crm.get_recent_updates())


# ---------------------------------------------------------------------------
# CRM entity endpoints
# ---------------------------------------------------------------------------


@app.route("/api/donors", methods=["GET", "POST"])
def get_donors():
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        created = crm.create_donor(payload)
        return _json_ok({"donor": created}, status=201)
    limit = int(request.args.get("limit", 100))
    return _json_ok(crm.get_donors(limit=limit))


@app.route("/api/donors/stats", methods=["GET"])
def donor_stats():
    return _json_ok(crm.get_donor_stats())


@app.route("/api/donors/<donor_id>", methods=["GET"])
def get_donor(donor_id: str):
    donor = crm.get_donor_detail(donor_id)
    if not donor:
        return _json_error("Donor not found", 404)
    return _json_ok(donor)


@app.route("/api/campaigns", methods=["GET", "POST"])
def campaigns():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_campaigns(limit=limit))

    payload = request.get_json(silent=True) or {}
    created = crm.create_campaign(payload)
    return _json_ok({"campaign": created}, status=201)


@app.route("/api/animals", methods=["GET", "POST"])
def animals():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_animals(limit=limit))
    payload = request.get_json(silent=True) or {}
    created = crm.create_animal(payload)
    return _json_ok({"animal": created}, status=201)


@app.route("/api/events", methods=["GET", "POST"])
def events():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_events(limit=limit))
    payload = request.get_json(silent=True) or {}
    created = crm.create_event(payload)
    return _json_ok({"event": created}, status=201)


@app.route("/api/stories", methods=["GET", "POST"])
def stories():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_stories(limit=limit))
    payload = request.get_json(silent=True) or {}
    created = crm.create_story(payload)
    return _json_ok({"story": created}, status=201)


@app.route("/api/communications/campaigns", methods=["GET", "POST"])
def communications_campaigns():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_communications(limit=limit))
    payload = request.get_json(silent=True) or {}
    created = crm.create_communication_campaign(payload)
    return _json_ok({"campaign": created}, status=201)


@app.route("/api/reports", methods=["GET"])
def reports():
    limit = int(request.args.get("limit", 100))
    return _json_ok(crm.get_reports(limit=limit))


@app.route("/api/reports/generate", methods=["POST"])
def generate_report():
    payload = request.get_json(silent=True) or {}
    created = crm.create_report(payload)
    return _json_ok({"report": created}, status=201)


@app.route("/api/team", methods=["GET", "POST"])
def team():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_team(limit=limit))
    payload = request.get_json(silent=True) or {}
    create_mode = str(payload.get("mode") or "").lower()
    if create_mode == "member" or str(payload.get("status", "")).lower() == "active":
        created = crm.create_team_member(payload)
    else:
        created = crm.invite_team_member(payload)
    return _json_ok({"member": created}, status=201)


@app.route("/api/team/<member_id>", methods=["GET", "PUT", "DELETE"])
def team_member(member_id: str):
    if request.method == "GET":
        member = crm.get_team_member(member_id)
        if not member:
            return _json_error("Team member not found", 404)
        return _json_ok({"member": member})
    if request.method == "PUT":
        payload = request.get_json(silent=True) or {}
        updated = crm.update_team_member(member_id, payload)
        if not updated:
            return _json_error("Team member not found", 404)
        return _json_ok({"member": updated})
    deleted = crm.delete_team_member(member_id)
    if not deleted:
        return _json_error("Team member not found", 404)
    return _json_ok({"deleted": True, "id": member_id})


# ---------------------------------------------------------------------------
# Automation run / progress endpoints (for future real-time UI integration)
# ---------------------------------------------------------------------------


@app.route("/api/progress/runs", methods=["GET", "POST"])
def automation_runs():
    if request.method == "GET":
        limit = int(request.args.get("limit", 50))
        return _json_ok(crm.get_automation_runs(limit=limit))
    payload = request.get_json(silent=True) or {}
    created = crm.create_automation_run(payload)
    return _json_ok({"run": created}, status=201)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.route("/api/health")
def health_check():
    return _json_ok(
        {
            "status": "healthy",
            "version": "1.1.0",
            "supabase_configured": crm.supabase_configured(),
            "sendgrid_active": False,
            "email_provider_status": "inactive-sendgrid",
        }
    )


if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    print("=" * 60)
    print("Funds 4 Furry Friends Dashboard Server")
    print("=" * 60)
    print("Dashboard URL: http://localhost:5000")
    print("API base:      http://localhost:5000/api/")
    print(f"Data source:   {crm.data_source()} (set SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY for live)")
    print("Email status:  SendGrid inactive (provider under review)")
    print("=" * 60)

    app.run(debug=True, host="0.0.0.0", port=5000)
