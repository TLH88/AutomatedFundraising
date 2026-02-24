"""
Funds 4 Furry Friends dashboard development server.

- Serves static frontend files
- Exposes JSON API endpoints for the expanded CRM dashboard
- Uses Supabase when configured, otherwise falls back to mock data
"""

from __future__ import annotations

import io
import sys
import threading
import traceback
import uuid
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

try:
    from scraper.discover import run_discovery as run_scraper_discovery, import_discovery_results
except ModuleNotFoundError:  # pragma: no cover - import fallback
    from .scraper.discover import run_discovery as run_scraper_discovery, import_discovery_results

app = Flask(__name__, static_folder="frontend")
CORS(app)

_EXPLORER_JOB_LOCK = threading.Lock()
_EXPLORER_JOBS: dict[str, dict] = {}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _explorer_job_snapshot(job_id: str):
    with _EXPLORER_JOB_LOCK:
        job = _EXPLORER_JOBS.get(job_id)
        if not job:
            return None
        return {**job}


def _update_explorer_job(job_id: str, **updates):
    with _EXPLORER_JOB_LOCK:
        job = _EXPLORER_JOBS.get(job_id)
        if not job:
            return None
        job.update(updates)
        job["updated_at"] = _utc_now_iso()
        return {**job}


def _start_explorer_discovery_job(payload: dict) -> dict:
    job_id = f"explr-{uuid.uuid4().hex[:12]}"
    job = {
        "job_id": job_id,
        "job_type": "funds_explorer_discovery",
        "status": "queued",
        "progress": 0,
        "step": "queued",
        "message": "Discovery job queued.",
        "created_at": _utc_now_iso(),
        "updated_at": _utc_now_iso(),
        "started_at": None,
        "finished_at": None,
        "error": None,
        "result": None,
        "payload": {
            "location": payload.get("location"),
            "radius_miles": payload.get("radius_miles"),
            "limit": payload.get("limit"),
            "min_score": payload.get("min_score"),
            "discovery_mode": payload.get("discovery_mode"),
            "max_runtime_seconds": payload.get("max_runtime_seconds"),
            "exclude_record_keys_count": len(payload.get("exclude_record_keys") or []),
            "extract_contacts": bool(payload.get("extract_contacts", True)),
        },
    }
    with _EXPLORER_JOB_LOCK:
        _EXPLORER_JOBS[job_id] = job

    def progress_cb(event: dict):
        _update_explorer_job(
            job_id,
            status=str(event.get("status") or "running"),
            step=str(event.get("step") or "running"),
            message=str(event.get("message") or ""),
            progress=int(event.get("progress", _EXPLORER_JOBS.get(job_id, {}).get("progress", 0) or 0)) if event.get("progress") is not None else _EXPLORER_JOBS.get(job_id, {}).get("progress", 0),
            event={k: v for k, v in event.items() if k not in {"message", "status", "step", "progress"}},
        )

    def worker():
        _update_explorer_job(job_id, status="running", step="starting", message="Starting discovery pipeline...", progress=1, started_at=_utc_now_iso())
        try:
            result = run_scraper_discovery(
                location=payload.get("location"),
                radius_miles=payload.get("radius_miles"),
                limit=payload.get("limit", 50),
                min_score=payload.get("min_score", 0),
                discovery_mode=payload.get("discovery_mode"),
                max_runtime_seconds=payload.get("max_runtime_seconds"),
                exclude_record_keys=payload.get("exclude_record_keys") or [],
                extract_contacts=bool(payload.get("extract_contacts", True)),
                dry_run=bool(payload.get("dry_run", False)),
                return_details=True,
                progress_cb=progress_cb,
            )
            _update_explorer_job(
                job_id,
                status="completed",
                step="complete",
                message=str((result or {}).get("matched_count", 0)) + " matches processed.",
                progress=100,
                finished_at=_utc_now_iso(),
                result=result if isinstance(result, dict) else {"saved_count": int(result or 0), "matched_count": int(result or 0), "organizations": []},
            )
        except Exception as exc:
            _update_explorer_job(
                job_id,
                status="failed",
                step="error",
                message=f"Discovery job failed: {exc}",
                error={"message": str(exc), "traceback": traceback.format_exc(limit=5)},
                finished_at=_utc_now_iso(),
            )

    threading.Thread(target=worker, name=f"explorer-job-{job_id}", daemon=True).start()
    return job


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


@app.route("/api/explorer/organizations", methods=["GET"])
def explorer_organizations():
    location = request.args.get("location", "").strip()
    radius_miles = request.args.get("radius_miles")
    limit = int(request.args.get("limit", 100))
    min_score = int(request.args.get("min_score", 0))
    return _json_ok(crm.get_explorer_organizations(
        location=location,
        radius_miles=radius_miles,
        limit=limit,
        min_score=min_score,
    ))


@app.route("/api/explorer/organizations/<org_id>", methods=["GET"])
def explorer_organization_detail(org_id: str):
    include_contacts = str(request.args.get("include_contacts", "true")).lower() != "false"
    org = crm.get_explorer_organization_detail(org_id, include_contacts=include_contacts)
    if not org:
        return _json_error("Organization not found", 404)
    return _json_ok({"organization": org})


@app.route("/api/explorer/schema-status", methods=["GET"])
def explorer_schema_status():
    return _json_ok({"schema": crm.get_explorer_schema_status()})


@app.route("/api/explorer/discover", methods=["POST"])
def explorer_discover():
    payload = request.get_json(silent=True) or {}
    location = str(payload.get("location") or "").strip() or None
    radius_miles = payload.get("radius_miles")
    limit = payload.get("limit", 50)
    min_score = payload.get("min_score", 0)
    discovery_mode = payload.get("discovery_mode")
    max_runtime_seconds = payload.get("max_runtime_seconds")
    exclude_record_keys = payload.get("exclude_record_keys") or []
    extract_contacts = bool(payload.get("extract_contacts", True))
    dry_run = bool(payload.get("dry_run", False))

    result = run_scraper_discovery(
        location=location,
        radius_miles=radius_miles,
        limit=limit,
        min_score=min_score,
        discovery_mode=discovery_mode,
        max_runtime_seconds=max_runtime_seconds,
        exclude_record_keys=exclude_record_keys,
        extract_contacts=extract_contacts,
        dry_run=dry_run,
        return_details=True,
    )
    if not isinstance(result, dict):
        return _json_ok({"saved_count": int(result or 0), "matched_count": int(result or 0), "organizations": []})
    return _json_ok(result)


@app.route("/api/explorer/import", methods=["POST"])
def explorer_import():
    payload = request.get_json(silent=True) or {}
    records = payload.get("records")
    if records is None:
        # Backward compatibility
        records = payload.get("organizations") or []
    extract_contacts = bool(payload.get("extract_contacts", False))
    min_score = payload.get("min_score", 0)
    result = import_discovery_results(
        records,
        extract_contacts=extract_contacts,
        min_score=min_score,
    )
    return _json_ok(result, status=201)


@app.route("/api/explorer/discover/jobs", methods=["POST"])
def explorer_discover_start_job():
    payload = request.get_json(silent=True) or {}
    job = _start_explorer_discovery_job(payload)
    return _json_ok({"job": job}, status=202)


@app.route("/api/explorer/discover/jobs/<job_id>", methods=["GET"])
def explorer_discover_job_status(job_id: str):
    job = _explorer_job_snapshot(job_id)
    if not job:
        return _json_error("Explorer discovery job not found", 404)
    return _json_ok({"job": job})


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
