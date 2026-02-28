"""
Funds 4 Furry Friends dashboard development server.

- Serves static frontend files
- Exposes JSON API endpoints for the expanded CRM dashboard
- Uses Supabase when configured, otherwise falls back to mock data
"""

from __future__ import annotations

import io
import json
import os
import secrets
import smtplib
import sys
import threading
import traceback
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, make_response, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import check_password_hash, generate_password_hash

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

try:
    from avatar_generation import generate_avatar_data_url, regenerate_existing_avatars
except ModuleNotFoundError:  # pragma: no cover - import fallback
    from .avatar_generation import generate_avatar_data_url, regenerate_existing_avatars

app = Flask(__name__, static_folder="frontend")
_cors_allowed_origins = [
    o.strip() for o in str(
        os.environ.get(
            "CORS_ALLOWED_ORIGINS",
            "http://127.0.0.1:5000,http://localhost:5000,http://127.0.0.1:5500,http://localhost:5500",
        )
    ).split(",") if o.strip()
]
CORS(
    app,
    resources={r"/api/*": {"origins": _cors_allowed_origins}},
    supports_credentials=True,
)

_EXPLORER_JOB_LOCK = threading.Lock()
_EXPLORER_JOBS: dict[str, dict] = {}
_AUTH_LOCK = threading.Lock()
_AUTH_SESSIONS: dict[str, dict] = {}
_RATE_LIMIT_LOCK = threading.Lock()
_RATE_LIMIT_BUCKETS: dict[str, list[float]] = {}
_AUTH_STORE_PATH = Path(__file__).resolve().parent / ".runtime_auth_accounts.json"
_AUTH_SESSION_TTL_SECONDS = 60 * 60 * 12
_AUTH_COOKIE_NAME = "funds_auth_token"
_FALLBACK_NOTIFICATION_EMAIL = "admin@localhost.localdomain"
_AUTH_BOOTSTRAP_TOKEN = str(os.environ.get("AUTH_BOOTSTRAP_TOKEN") or "").strip()
_ADOPTION_REQUESTS_PATH = Path(__file__).resolve().parent / ".runtime_adoption_requests.json"
_HELP_REQUESTS_PATH = Path(__file__).resolve().parent / ".runtime_help_requests.json"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _utc_now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


def _append_adoption_request(record: dict) -> None:
    try:
        if _ADOPTION_REQUESTS_PATH.exists():
            current = json.loads(_ADOPTION_REQUESTS_PATH.read_text(encoding="utf-8"))
            rows = current if isinstance(current, list) else []
        else:
            rows = []
    except Exception:
        rows = []
    rows.insert(0, record)
    try:
        _ADOPTION_REQUESTS_PATH.write_text(json.dumps(rows[:500], indent=2), encoding="utf-8")
    except Exception:
        pass


def _append_help_request(record: dict) -> None:
    try:
        if _HELP_REQUESTS_PATH.exists():
            current = json.loads(_HELP_REQUESTS_PATH.read_text(encoding="utf-8"))
            rows = current if isinstance(current, list) else []
        else:
            rows = []
    except Exception:
        rows = []
    rows.insert(0, record)
    try:
        _HELP_REQUESTS_PATH.write_text(json.dumps(rows[:500], indent=2), encoding="utf-8")
    except Exception:
        pass


def _send_adoption_request_email(record: dict) -> tuple[bool, str]:
    target = (
        str(os.environ.get("ADOPTION_REQUEST_TO_EMAIL") or "").strip()
        or str(os.environ.get("SENDER_EMAIL") or "").strip()
        or _FALLBACK_NOTIFICATION_EMAIL
    )
    smtp_host = str(os.environ.get("SMTP_HOST") or "").strip()
    smtp_port = int(str(os.environ.get("SMTP_PORT") or "587").strip() or "587")
    smtp_user = str(os.environ.get("SMTP_USERNAME") or "").strip()
    smtp_pass = str(os.environ.get("SMTP_PASSWORD") or "").strip()
    smtp_use_tls = str(os.environ.get("SMTP_USE_TLS") or "true").strip().lower() not in {"0", "false", "no"}
    from_email = str(os.environ.get("SMTP_FROM_EMAIL") or os.environ.get("SENDER_EMAIL") or target).strip()

    if not smtp_host:
        return False, f"SMTP_HOST not configured; request logged for {target}"

    subject = f"Adoption Request: {record.get('animal_name') or 'Animal'}"
    body = (
        "A new adoption request was submitted.\n\n"
        f"Animal: {record.get('animal_name') or 'Unknown'}\n"
        f"Animal ID: {record.get('animal_id') or 'N/A'}\n"
        f"Requester Name: {record.get('requester_name') or ''}\n"
        f"Requester Phone: {record.get('requester_phone') or ''}\n"
        f"Requester Email: {record.get('requester_email') or ''}\n\n"
        f"Notes:\n{record.get('notes') or 'None provided'}\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = target
    msg.set_content(body)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
            if smtp_use_tls:
                smtp.starttls()
            if smtp_user:
                smtp.login(smtp_user, smtp_pass)
            smtp.send_message(msg)
        return True, f"Sent to {target}"
    except Exception as exc:
        return False, f"Email send failed; request logged for {target}: {exc}"


def _send_help_request_email(record: dict) -> tuple[bool, str]:
    target = (
        str(os.environ.get("HELP_REQUEST_TO_EMAIL") or "").strip()
        or str(os.environ.get("ADOPTION_REQUEST_TO_EMAIL") or "").strip()
        or str(os.environ.get("SENDER_EMAIL") or "").strip()
        or _FALLBACK_NOTIFICATION_EMAIL
    )
    smtp_host = str(os.environ.get("SMTP_HOST") or "").strip()
    smtp_port = int(str(os.environ.get("SMTP_PORT") or "587").strip() or "587")
    smtp_user = str(os.environ.get("SMTP_USERNAME") or "").strip()
    smtp_pass = str(os.environ.get("SMTP_PASSWORD") or "").strip()
    smtp_use_tls = str(os.environ.get("SMTP_USE_TLS") or "true").strip().lower() not in {"0", "false", "no"}
    from_email = str(os.environ.get("SMTP_FROM_EMAIL") or os.environ.get("SENDER_EMAIL") or target).strip()

    if not smtp_host:
        return False, f"SMTP_HOST not configured; request logged for {target}"

    req_type = str(record.get("request_type") or "help").lower()
    subject = f"Public {req_type.title()} Request"
    body_lines = [
        "A new public help request was submitted.",
        "",
        f"Request Type: {req_type}",
        f"Name: {record.get('requester_name') or ''}",
        f"Phone: {record.get('requester_phone') or ''}",
        f"Email: {record.get('requester_email') or ''}",
    ]
    if record.get("company_name"):
        body_lines.append(f"Company Name: {record.get('company_name')}")
    if record.get("company_size"):
        body_lines.append(f"Company Size: {record.get('company_size')}")
    if record.get("giving_interest"):
        body_lines.append(f"Giving Interest: {record.get('giving_interest')}")
    body_lines.extend(["", "Notes:", str(record.get("notes") or "None provided")])

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = target
    msg.set_content("\n".join(body_lines))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
            if smtp_use_tls:
                smtp.starttls()
            if smtp_user:
                smtp.login(smtp_user, smtp_pass)
            smtp.send_message(msg)
        return True, f"Sent to {target}"
    except Exception as exc:
        return False, f"Email send failed; request logged for {target}: {exc}"


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For") or ""
    if fwd:
        return fwd.split(",", 1)[0].strip() or "unknown"
    return request.remote_addr or "unknown"


def _rate_limit_allow(bucket: str, *, limit: int, window_seconds: int) -> bool:
    now = _utc_now_ts()
    lower = now - float(window_seconds)
    with _RATE_LIMIT_LOCK:
        timestamps = [ts for ts in _RATE_LIMIT_BUCKETS.get(bucket, []) if ts >= lower]
        if len(timestamps) >= int(limit):
            _RATE_LIMIT_BUCKETS[bucket] = timestamps
            return False
        timestamps.append(now)
        _RATE_LIMIT_BUCKETS[bucket] = timestamps
    return True


def _is_trusted_origin(origin: str) -> bool:
    value = str(origin or "").strip().rstrip("/")
    if not value:
        return True
    host_origin = request.host_url.rstrip("/")
    if value == host_origin:
        return True
    return value in set(_cors_allowed_origins)


def _auth_role_rank(role: str) -> int:
    key = str(role or "visitor").lower()
    if key in {"administrator", "admin"}:
        return 3
    if key in {"member", "editor"}:
        return 2
    return 1


def _auth_normalize_role(role: str) -> str:
    key = str(role or "visitor").lower().strip()
    if key in {"admin", "administrator"}:
        return "administrator"
    if key in {"member", "editor"}:
        return "member"
    return "visitor"


def _validate_password_strength(password: str) -> tuple[bool, str]:
    raw = str(password or "")
    if len(raw) < 8:
        return False, "Password must be at least 8 characters."
    has_upper = any(ch.isupper() for ch in raw)
    has_lower = any(ch.islower() for ch in raw)
    has_digit = any(ch.isdigit() for ch in raw)
    if not (has_upper and has_lower and has_digit):
        return False, "Password must include uppercase, lowercase, and a number."
    return True, ""


def _load_auth_accounts() -> list[dict]:
    try:
        if _AUTH_STORE_PATH.exists():
            data = json.loads(_AUTH_STORE_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list):
                accounts = [a for a in data if isinstance(a, dict)]
            else:
                accounts = []
        else:
            accounts = []
    except Exception:
        accounts = []
    changed = False
    for account in accounts:
        role = _auth_normalize_role(account.get("role"))
        if role != account.get("role"):
            account["role"] = role
            account["updated_at"] = _utc_now_iso()
            changed = True
        status = str(account.get("status") or "active").lower()
        if status not in {"active", "disabled", "invited"}:
            account["status"] = "active"
            account["updated_at"] = _utc_now_iso()
            changed = True
        if not str(account.get("email") or "").strip():
            account["status"] = "disabled"
            account["updated_at"] = _utc_now_iso()
            changed = True
    if changed:
        _save_auth_accounts(accounts)
    return accounts


def _save_auth_accounts(accounts: list[dict]) -> None:
    try:
        _AUTH_STORE_PATH.write_text(json.dumps(accounts, indent=2), encoding="utf-8")
    except Exception:
        pass


def _find_auth_account(email: str) -> dict | None:
    target = str(email or "").strip().lower()
    if not target:
        return None
    for account in _load_auth_accounts():
        if str(account.get("email") or "").strip().lower() == target:
            return account
    return None


def _upsert_auth_account(payload: dict) -> dict:
    accounts = _load_auth_accounts()
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Email is required")
    idx = next((i for i, a in enumerate(accounts) if str(a.get("email") or "").lower() == email), -1)
    existing = accounts[idx] if idx >= 0 else {}
    merged = {
        "id": payload.get("id") or existing.get("id") or f"acct-{uuid.uuid4().hex[:10]}",
        "email": email,
        "full_name": payload.get("full_name") or existing.get("full_name") or email,
        "role": _auth_normalize_role(payload.get("role") or existing.get("role") or "visitor"),
        "status": str(payload.get("status") or existing.get("status") or "active").lower(),
        "title": payload.get("title") if "title" in payload else existing.get("title"),
        "team_member_id": payload.get("team_member_id") if "team_member_id" in payload else existing.get("team_member_id"),
        "is_default_admin": bool(payload.get("is_default_admin", existing.get("is_default_admin", False))),
        "updated_at": _utc_now_iso(),
    }
    password = payload.get("password")
    password_hash = payload.get("password_hash")
    if password_hash:
        merged["password_hash"] = password_hash
    elif password is not None and str(password):
        ok, message = _validate_password_strength(str(password))
        if not ok:
            raise ValueError(message)
        merged["password_hash"] = generate_password_hash(str(password))
    else:
        existing_hash = existing.get("password_hash")
        if existing_hash:
            merged["password_hash"] = existing_hash
        elif str(merged.get("status") or "active").lower() == "active":
            raise ValueError("A strong password is required for active accounts.")
        else:
            merged["password_hash"] = ""
    if idx >= 0:
        accounts[idx] = merged
    else:
        accounts.insert(0, merged)
    _save_auth_accounts(accounts)
    return merged


def _change_auth_password(email: str, current_password: str, new_password: str, *, admin_override: bool = False) -> tuple[bool, str]:
    accounts = _load_auth_accounts()
    target = str(email or "").strip().lower()
    idx = next((i for i, a in enumerate(accounts) if str(a.get("email") or "").lower() == target), -1)
    if idx < 0:
        return False, "Account not found."
    acct = accounts[idx]
    if not admin_override:
        if not check_password_hash(str(acct.get("password_hash") or ""), str(current_password or "")):
            return False, "Current password is incorrect."
    ok, message = _validate_password_strength(str(new_password))
    if not ok:
        return False, message
    acct["password_hash"] = generate_password_hash(str(new_password))
    acct["updated_at"] = _utc_now_iso()
    accounts[idx] = acct
    _save_auth_accounts(accounts)
    return True, "Password updated."


def _issue_auth_session(account: dict) -> dict:
    token = secrets.token_urlsafe(32)
    session = {
        "token": token,
        "email": str(account.get("email") or "").lower(),
        "full_name": account.get("full_name") or account.get("email"),
        "role": _auth_normalize_role(account.get("role")),
        "status": str(account.get("status") or "active").lower(),
        "team_member_id": account.get("team_member_id"),
        "is_default_admin": bool(account.get("is_default_admin")),
        "created_at": _utc_now_iso(),
        "expires_at_ts": _utc_now_ts() + _AUTH_SESSION_TTL_SECONDS,
    }
    with _AUTH_LOCK:
        _AUTH_SESSIONS[token] = session
    return session


def _get_bearer_token() -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    cookie_token = request.cookies.get(_AUTH_COOKIE_NAME)
    if cookie_token:
        return str(cookie_token).strip()
    return None


def _get_auth_session_from_request() -> dict | None:
    token = _get_bearer_token()
    if not token:
        return None
    with _AUTH_LOCK:
        session = _AUTH_SESSIONS.get(token)
        if not session:
            return None
        if float(session.get("expires_at_ts") or 0) < _utc_now_ts():
            _AUTH_SESSIONS.pop(token, None)
            return None
        session["expires_at_ts"] = _utc_now_ts() + _AUTH_SESSION_TTL_SECONDS
        _AUTH_SESSIONS[token] = session
        return {**session}


def _auth_public_session_payload(session: dict | None) -> dict:
    if not session:
        return {"authenticated": False, "user": None}
    return {
        "authenticated": True,
        "user": {
            "email": session.get("email"),
            "full_name": session.get("full_name"),
            "role": session.get("role"),
            "team_member_id": session.get("team_member_id"),
            "is_default_admin": bool(session.get("is_default_admin")),
        },
        "expires_at_ts": session.get("expires_at_ts"),
    }


def _require_auth(min_role: str = "member"):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            session = getattr(g, "auth_session", None)
            if not session:
                return _json_error("Authentication required", 401)
            if str(session.get("status") or "active").lower() != "active":
                return _json_error("Account is not active", 403)
            if _auth_role_rank(session.get("role")) < _auth_role_rank(min_role):
                return _json_error("Insufficient permissions", 403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def _sync_team_member_to_auth_store(member_payload: dict, *, password: str | None = None):
    if not member_payload:
        return None
    role = str(member_payload.get("role") or "viewer").lower()
    auth_role = "administrator" if role == "administrator" else ("member" if role in {"editor", "member"} else "visitor")
    status = str(member_payload.get("status") or "active").lower()
    if status == "disabled":
        auth_status = "disabled"
    elif status == "inactive":
        auth_status = "disabled"
    elif status == "invited":
        auth_status = "invited"
    else:
        auth_status = "active"
    payload = {
        "email": member_payload.get("email"),
        "full_name": member_payload.get("full_name") or member_payload.get("name"),
        "role": auth_role,
        "status": auth_status,
        "title": member_payload.get("title"),
        "team_member_id": member_payload.get("id"),
        "is_default_admin": bool(member_payload.get("is_default_admin")),
    }
    if password:
        payload["password"] = password
    return _upsert_auth_account(payload)


def _auth_bootstrap_needed() -> bool:
    accounts = _load_auth_accounts()
    for account in accounts:
        if _auth_role_rank(account.get("role")) >= _auth_role_rank("administrator"):
            if str(account.get("status") or "active").lower() == "active":
                return False
    return True


def _avatar_seed(email: str, name: str, role: str, record_id: str | None = None) -> str:
    return f"{str(email or '').strip().lower()}|{str(name or '').strip()}|{str(role or '').strip().lower()}|{str(record_id or '').strip()}"


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


def _json_error(
    message: str,
    status: int = 400,
    *,
    code: str | None = None,
    details: str | None = None,
    hint: str | None = None,
):
    payload = {"error": message, "meta": {"data_source": crm.data_source()}}
    if code:
        payload["code"] = code
    if details:
        payload["details"] = details
    if hint:
        payload["hint"] = hint
    return jsonify(payload), status


def _exception_parts(exc: Exception) -> tuple[str, str | None, str | None, str | None]:
    msg = str(getattr(exc, "args", [None])[0] or str(exc) or "Operation failed").strip()
    code = getattr(exc, "code", None)
    details = getattr(exc, "details", None) or getattr(exc, "detail", None)
    hint = getattr(exc, "hint", None)
    return msg, (str(code) if code else None), (str(details) if details else None), (str(hint) if hint else None)


def _json_from_exception(exc: Exception, *, status: int = 400, prefix: str | None = None):
    msg, code, details, hint = _exception_parts(exc)
    out = f"{prefix}: {msg}" if prefix else msg
    return _json_error(out, status, code=code, details=details, hint=hint)


@app.before_request
def attach_auth_session():
    if request.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("Origin") or ""
        if origin and not _is_trusted_origin(origin):
            return _json_error("Blocked by CSRF origin policy.", 403)
        if not _rate_limit_allow(f"api-write:{_client_ip()}", limit=180, window_seconds=60):
            return _json_error("Too many requests. Please try again shortly.", 429)
    g.auth_session = _get_auth_session_from_request()


@app.after_request
def apply_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
    if request.is_secure:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.route("/")
def serve_landing():
    return send_from_directory(app.static_folder, "landing.html")


@app.route("/<path:path>")
def serve_static(path: str):
    return send_from_directory(app.static_folder, path)


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    if not email or not password:
        return _json_error("Email and password are required", 400)
    ip = _client_ip()
    if not _rate_limit_allow(f"auth-login:ip:{ip}", limit=20, window_seconds=60):
        return _json_error("Too many login attempts. Please wait and try again.", 429)
    if not _rate_limit_allow(f"auth-login:email:{email}:{ip}", limit=8, window_seconds=60):
        return _json_error("Too many login attempts for this account. Please wait and try again.", 429)
    account = _find_auth_account(email)
    if not account:
        return _json_error("No account found for that email.", 404)
    if str(account.get("status") or "active").lower() != "active":
        return _json_error("This account is not active.", 403)
    if not check_password_hash(str(account.get("password_hash") or ""), password):
        return _json_error("Incorrect password.", 401)
    session = _issue_auth_session(account)
    resp, status = _json_ok({"session": _auth_public_session_payload(session), "token": session["token"]})
    out = make_response(resp, status)
    out.set_cookie(
        _AUTH_COOKIE_NAME,
        session["token"],
        max_age=_AUTH_SESSION_TTL_SECONDS,
        httponly=True,
        samesite="Lax",
        secure=str(os.environ.get("AUTH_COOKIE_SECURE", "false")).lower() in {"1", "true", "yes"},
        path="/",
    )
    return out


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    token = _get_bearer_token()
    if token:
        with _AUTH_LOCK:
            _AUTH_SESSIONS.pop(token, None)
    resp, status = _json_ok({"logged_out": True})
    out = make_response(resp, status)
    out.set_cookie(_AUTH_COOKIE_NAME, "", expires=0, httponly=True, samesite="Lax", path="/")
    return out


@app.route("/api/auth/session", methods=["GET"])
def auth_session():
    return _json_ok({"session": _auth_public_session_payload(getattr(g, "auth_session", None))})


@app.route("/api/auth/bootstrap/status", methods=["GET"])
def auth_bootstrap_status():
    return _json_ok(
        {
            "needs_bootstrap": _auth_bootstrap_needed(),
            "bootstrap_token_configured": bool(_AUTH_BOOTSTRAP_TOKEN),
        }
    )


@app.route("/api/auth/bootstrap/admin", methods=["POST"])
def auth_bootstrap_admin():
    if not _auth_bootstrap_needed():
        return _json_error("Bootstrap is disabled because an active administrator already exists.", 409)
    if not _AUTH_BOOTSTRAP_TOKEN:
        return _json_error("AUTH_BOOTSTRAP_TOKEN is not configured on the server.", 503)

    payload = request.get_json(silent=True) or {}
    provided_token = str(payload.get("bootstrap_token") or "").strip()
    if not provided_token or provided_token != _AUTH_BOOTSTRAP_TOKEN:
        return _json_error("Invalid bootstrap token.", 403)

    email = str(payload.get("email") or "").strip().lower()
    full_name = str(payload.get("full_name") or "").strip() or "Administrator"
    password = str(payload.get("password") or "")
    if not email:
        return _json_error("Email is required.", 400)
    if "@" not in email or "." not in email.split("@")[-1]:
        return _json_error("A valid email address is required.", 400)
    ok, message = _validate_password_strength(password)
    if not ok:
        return _json_error(message, 400)

    if _find_auth_account(email):
        return _json_error("An account already exists for that email.", 409)

    created = _upsert_auth_account(
        {
            "email": email,
            "full_name": full_name,
            "role": "administrator",
            "status": "active",
            "title": payload.get("title") or "System Administrator",
            "password": password,
            "is_default_admin": False,
        }
    )
    session = _issue_auth_session(created)
    resp, status = _json_ok({"bootstrapped": True, "session": _auth_public_session_payload(session)})
    out = make_response(resp, status)
    out.set_cookie(
        _AUTH_COOKIE_NAME,
        session["token"],
        max_age=_AUTH_SESSION_TTL_SECONDS,
        httponly=True,
        samesite="Lax",
        secure=str(os.environ.get("AUTH_COOKIE_SECURE", "false")).lower() in {"1", "true", "yes"},
        path="/",
    )
    return out


@app.route("/api/auth/password", methods=["POST"])
@_require_auth("member")
def auth_change_password():
    payload = request.get_json(silent=True) or {}
    session = g.auth_session or {}
    target_email = str(payload.get("email") or session.get("email") or "").strip().lower()
    current_password = str(payload.get("current_password") or "")
    new_password = str(payload.get("new_password") or "")
    is_admin = _auth_role_rank(session.get("role")) >= _auth_role_rank("administrator")
    if not target_email:
        return _json_error("Target email is required", 400)
    if not is_admin and target_email != str(session.get("email") or "").lower():
        return _json_error("You can only change your own password", 403)
    ok, message = _change_auth_password(
        target_email,
        current_password=current_password,
        new_password=new_password,
        admin_override=(is_admin and target_email != str(session.get("email") or "").lower()),
    )
    if not ok:
        return _json_error(message, 400)
    return _json_ok({"updated": True, "email": target_email, "message": message})


# ---------------------------------------------------------------------------
# Dashboard endpoints
# ---------------------------------------------------------------------------


@app.route("/api/avatars/generate", methods=["POST"])
@_require_auth("member")
def avatar_generate():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()
    name = str(payload.get("name") or payload.get("full_name") or "").strip()
    role = str(payload.get("role") or "profile").strip().lower()
    seed = str(payload.get("seed") or "").strip()
    if not seed:
        seed = _avatar_seed(email=email, name=name, role=role, record_id=str(payload.get("record_id") or ""))
    generated = generate_avatar_data_url(seed=seed, role=role)
    return _json_ok({
        "avatar_url": generated.get("avatar_url"),
        "provider": generated.get("provider"),
        "model": generated.get("model"),
        "seed": seed,
    })


@app.route("/api/avatars/regenerate-existing", methods=["POST"])
@_require_auth("administrator")
def avatar_regenerate_existing():
    result = regenerate_existing_avatars()
    return _json_ok(result)


@app.route("/api/fundraising/trends")
def fundraising_trends():
    range_raw = str(request.args.get("range", "")).strip()
    range_days = int(range_raw) if range_raw.isdigit() else None
    start_date = str(request.args.get("start_date", "")).strip() or None
    end_date = str(request.args.get("end_date", "")).strip() or None
    return _json_ok(crm.get_fundraising_trends(range_days=range_days, start_date=start_date, end_date=end_date))


@app.route("/api/fundraising/total")
def fundraising_total():
    return _json_ok(crm.get_fundraising_total())


@app.route("/api/donations/recent")
def recent_donations():
    limit = int(request.args.get("limit", 10))
    return _json_ok(crm.get_recent_donations(limit=limit))


@app.route("/api/donations", methods=["POST"])
@_require_auth("member")
def create_donation():
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_donation(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to create donation")
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
@_require_auth("member")
def get_donors():
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        if not str(payload.get("avatar_url") or "").strip():
            donor_name = str(payload.get("full_name") or payload.get("name") or "").strip()
            donor_email = str(payload.get("email") or "").strip().lower()
            seed = _avatar_seed(donor_email, donor_name, "donor")
            payload["avatar_url"] = generate_avatar_data_url(seed=seed, role="donor").get("avatar_url")
        try:
            created = crm.create_donor(payload)
        except Exception as exc:
            return _json_from_exception(exc, status=400, prefix="Unable to create donor")
        return _json_ok({"donor": created}, status=201)
    limit = int(request.args.get("limit", 100))
    return _json_ok(crm.get_donors(limit=limit))


@app.route("/api/donors/stats", methods=["GET"])
@_require_auth("member")
def donor_stats():
    return _json_ok(crm.get_donor_stats())


@app.route("/api/donors/<donor_id>", methods=["GET"])
@_require_auth("member")
def get_donor(donor_id: str):
    donor = crm.get_donor_detail(donor_id)
    if not donor:
        return _json_error("Donor not found", 404)
    return _json_ok(donor)


@app.route("/api/donors/<donor_id>", methods=["PUT", "DELETE"])
@_require_auth("member")
def mutate_donor(donor_id: str):
    if request.method == "DELETE":
        # No donor delete workflow yet; preserve records by disabling instead of deleting.
        return _json_error("Donor deletion is not supported. Disable or archive via future workflow.", 405)
    payload = request.get_json(silent=True) or {}
    updated = crm.update_donor(donor_id, payload)
    if not updated:
        return _json_error("Donor not found", 404)
    return _json_ok({"donor": updated})


@app.route("/api/donors/<donor_id>/notes", methods=["GET", "POST"])
@_require_auth("member")
def donor_notes(donor_id: str):
    if request.method == "GET":
        return _json_ok(crm.get_donor_notes(donor_id))
    payload = request.get_json(silent=True) or {}
    author = (getattr(g, "auth_session", {}) or {}).get("full_name") or "Team Member"
    created = crm.create_donor_note(donor_id, {**payload, "author": author})
    if not created:
        return _json_error("Note content is required", 400)
    return _json_ok({"note": created}, status=201)


@app.route("/api/contacts", methods=["GET"])
@_require_auth("member")
def contacts():
    limit = int(request.args.get("limit", 500))
    return _json_ok(crm.get_contacts(limit=limit))


@app.route("/api/campaigns", methods=["GET", "POST"])
def campaigns():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_campaigns(limit=limit))

    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_campaign(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to create campaign")
    return _json_ok({"campaign": created}, status=201)


@app.route("/api/campaigns/<campaign_id>", methods=["GET", "PUT", "DELETE"])
def campaign_detail(campaign_id: str):
    if request.method == "GET":
        campaign = crm.get_campaign_detail(campaign_id)
        if not campaign:
            return _json_error("Campaign not found", 404)
        return _json_ok({"campaign": campaign})

    if request.method == "DELETE":
        if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
            return _json_error("Authentication required", 401)
        try:
            deleted = crm.delete_campaign(campaign_id)
        except Exception as exc:
            return _json_from_exception(exc, status=400, prefix="Unable to delete campaign")
        if not deleted:
            return _json_error("Campaign could not be deleted", 400)
        return _json_ok({"deleted": True, "campaign_id": campaign_id})

    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        updated = crm.update_campaign(campaign_id, payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to update campaign")
    if not updated:
        return _json_error("Campaign not found", 404)
    return _json_ok({"campaign": updated})


@app.route("/api/animals", methods=["GET", "POST"])
def animals():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_animals(limit=limit))
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_animal(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to save animal record")
    return _json_ok({"animal": created}, status=201)


@app.route("/api/animals/<animal_id>", methods=["GET", "PUT", "DELETE"])
def animal_detail(animal_id: str):
    if request.method == "GET":
        animal = crm.get_animal_detail(animal_id)
        if not animal:
            return _json_error("Animal not found", 404)
        return _json_ok({"animal": animal})
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    if request.method == "DELETE":
        deleted = crm.delete_animal(animal_id)
        if not deleted:
            return _json_error("Animal not found", 404)
        return _json_ok({"deleted": True, "id": animal_id})
    payload = request.get_json(silent=True) or {}
    try:
        updated = crm.update_animal(animal_id, payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to update animal record")
    if not updated:
        return _json_error("Animal not found", 404)
    return _json_ok({"animal": updated})


@app.route("/api/animals/<animal_id>/notes", methods=["GET", "POST"])
def animal_notes(animal_id: str):
    if request.method == "GET":
        return _json_ok(crm.get_animal_notes(animal_id))
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    author = (getattr(g, "auth_session", {}) or {}).get("full_name") or "Team Member"
    created = crm.create_animal_note(animal_id, {**payload, "author": author})
    if not created:
        return _json_error("Note content is required", 400)
    return _json_ok({"note": created}, status=201)


@app.route("/api/events", methods=["GET", "POST"])
def events():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_events(limit=limit))
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_event(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to create event")
    return _json_ok({"event": created}, status=201)


@app.route("/api/stories", methods=["GET", "POST"])
def stories():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_stories(limit=limit))
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_story(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to create story")
    return _json_ok({"story": created}, status=201)


@app.route("/api/stories/<story_id>", methods=["GET", "PUT"])
def story_detail(story_id: str):
    if request.method == "GET":
        story = crm.get_story(story_id)
        if not story:
            return _json_error("Story not found", 404)
        return _json_ok({"story": story})
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        updated = crm.update_story(story_id, payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to update story")
    if not updated:
        return _json_error("Story not found", 404)
    return _json_ok({"story": updated})


@app.route("/api/public/adoption-requests", methods=["POST"])
def public_adoption_requests():
    payload = request.get_json(silent=True) or {}
    requester_name = str(payload.get("requester_name") or payload.get("name") or "").strip()
    requester_phone = str(payload.get("requester_phone") or payload.get("phone") or "").strip()
    requester_email = str(payload.get("requester_email") or payload.get("email") or "").strip().lower()
    notes = str(payload.get("notes") or "").strip()
    animal_id = str(payload.get("animal_id") or "").strip()
    animal_name = str(payload.get("animal_name") or "").strip()

    if not requester_name or not requester_phone or not requester_email:
        return _json_error("Name, phone number, and email are required.", 400)
    if "@" not in requester_email or "." not in requester_email.split("@")[-1]:
        return _json_error("A valid email address is required.", 400)

    if animal_id and not animal_name:
        try:
            found = crm.get_animal(animal_id)
            if found:
                animal_name = str(found.get("name") or "").strip()
        except Exception:
            pass

    record = {
        "id": f"adopt-{uuid.uuid4().hex[:10]}",
        "submitted_at": _utc_now_iso(),
        "animal_id": animal_id or None,
        "animal_name": animal_name or "Unknown Animal",
        "requester_name": requester_name,
        "requester_phone": requester_phone,
        "requester_email": requester_email,
        "notes": notes,
        "source": "public-site",
    }
    _append_adoption_request(record)
    sent, message = _send_adoption_request_email(record)
    return _json_ok({"submitted": True, "email_sent": bool(sent), "message": message, "request_id": record["id"]}, status=201)


@app.route("/api/public/help-requests", methods=["POST"])
def public_help_requests():
    payload = request.get_json(silent=True) or {}
    request_type = str(payload.get("request_type") or "volunteer").strip().lower()
    requester_name = str(payload.get("requester_name") or payload.get("name") or "").strip()
    requester_phone = str(payload.get("requester_phone") or payload.get("phone") or "").strip()
    requester_email = str(payload.get("requester_email") or payload.get("email") or "").strip().lower()
    company_name = str(payload.get("company_name") or "").strip()
    company_size = str(payload.get("company_size") or "").strip()
    giving_interest = str(payload.get("giving_interest") or "").strip()
    notes = str(payload.get("notes") or "").strip()

    if request_type not in {"volunteer", "business"}:
        return _json_error("request_type must be 'volunteer' or 'business'.", 400)
    if not requester_name or not requester_phone or not requester_email:
        return _json_error("Name, phone number, and email are required.", 400)
    if "@" not in requester_email or "." not in requester_email.split("@")[-1]:
        return _json_error("A valid email address is required.", 400)
    if request_type == "business":
        if not company_name or not company_size:
            return _json_error("Company name and company size are required for business requests.", 400)

    record = {
        "id": f"help-{uuid.uuid4().hex[:10]}",
        "submitted_at": _utc_now_iso(),
        "request_type": request_type,
        "requester_name": requester_name,
        "requester_phone": requester_phone,
        "requester_email": requester_email,
        "company_name": company_name or None,
        "company_size": company_size or None,
        "giving_interest": giving_interest or None,
        "notes": notes,
        "source": "public-site",
    }
    _append_help_request(record)
    sent, message = _send_help_request_email(record)
    return _json_ok(
        {
            "submitted": True,
            "email_sent": bool(sent),
            "message": message,
            "request_id": record["id"],
            "request_type": request_type,
        },
        status=201,
    )


@app.route("/api/communications/campaigns", methods=["GET", "POST"])
def communications_campaigns():
    if request.method == "GET":
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_communications(limit=limit))
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_communication_campaign(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to create communication campaign")
    return _json_ok({"campaign": created}, status=201)


@app.route("/api/communications/campaigns/<campaign_id>", methods=["GET", "PUT"])
def communications_campaign_detail(campaign_id: str):
    if request.method == "GET":
        campaign = crm.get_communication_campaign(campaign_id)
        if not campaign:
            return _json_error("Campaign not found", 404)
        return _json_ok({"campaign": campaign})
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        updated = crm.update_communication_campaign(campaign_id, payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to update communication campaign")
    if not updated:
        return _json_error("Campaign not found", 404)
    return _json_ok({"campaign": updated})


@app.route("/api/reports", methods=["GET"])
def reports():
    limit = int(request.args.get("limit", 100))
    return _json_ok(crm.get_reports(limit=limit))


@app.route("/api/reports/<report_id>", methods=["GET", "PUT"])
def report_detail(report_id: str):
    if request.method == "GET":
        report = crm.get_report(report_id)
        if not report:
            return _json_error("Report not found", 404)
        return _json_ok({"report": report})
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        updated = crm.update_report(report_id, payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to update report")
    if not updated:
        return _json_error("Report not found", 404)
    return _json_ok({"report": updated})


@app.route("/api/explorer/organizations", methods=["GET"])
@_require_auth("member")
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
@_require_auth("member")
def explorer_organization_detail(org_id: str):
    include_contacts = str(request.args.get("include_contacts", "true")).lower() != "false"
    org = crm.get_explorer_organization_detail(org_id, include_contacts=include_contacts)
    if not org:
        return _json_error("Organization not found", 404)
    return _json_ok({"organization": org})


@app.route("/api/explorer/schema-status", methods=["GET"])
@_require_auth("member")
def explorer_schema_status():
    return _json_ok({"schema": crm.get_explorer_schema_status()})


@app.route("/api/explorer/discover", methods=["POST"])
@_require_auth("member")
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
@_require_auth("member")
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
@_require_auth("member")
def explorer_discover_start_job():
    payload = request.get_json(silent=True) or {}
    job = _start_explorer_discovery_job(payload)
    return _json_ok({"job": job}, status=202)


@app.route("/api/explorer/discover/jobs/<job_id>", methods=["GET"])
@_require_auth("member")
def explorer_discover_job_status(job_id: str):
    job = _explorer_job_snapshot(job_id)
    if not job:
        return _json_error("Explorer discovery job not found", 404)
    return _json_ok({"job": job})


@app.route("/api/reports/generate", methods=["POST"])
@_require_auth("member")
def generate_report():
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_report(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to generate report")
    return _json_ok({"report": created}, status=201)


@app.route("/api/team", methods=["GET", "POST"])
def team():
    if request.method == "GET":
        if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
            return _json_error("Authentication required", 401)
        limit = int(request.args.get("limit", 100))
        return _json_ok(crm.get_team(limit=limit))
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("administrator"):
        return _json_error("Administrator access required", 403)
    payload = request.get_json(silent=True) or {}
    if not str(payload.get("avatar_url") or "").strip():
        full_name = str(payload.get("full_name") or payload.get("name") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        role = str(payload.get("role") or "member").strip().lower()
        seed = _avatar_seed(email, full_name, role)
        payload["avatar_url"] = generate_avatar_data_url(seed=seed, role=role).get("avatar_url")
    create_mode = str(payload.get("mode") or "").lower()
    target_status = str(payload.get("status") or "").lower()
    requires_password = create_mode == "member" or target_status == "active"
    if requires_password:
        ok, message = _validate_password_strength(str(payload.get("password") or ""))
        if not ok:
            return _json_error(message, 400)
    try:
        if create_mode == "member" or str(payload.get("status", "")).lower() == "active":
            created = crm.create_team_member(payload)
        else:
            created = crm.invite_team_member(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to create team member")
    password = str(payload.get("password") or "")
    try:
        _sync_team_member_to_auth_store(created or {}, password=password or None)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to configure auth account for team member")
    return _json_ok({"member": created}, status=201)


@app.route("/api/team/<member_id>", methods=["GET", "PUT", "DELETE"])
def team_member(member_id: str):
    if request.method == "GET":
        if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
            return _json_error("Authentication required", 401)
        member = crm.get_team_member(member_id)
        if not member:
            return _json_error("Team member not found", 404)
        return _json_ok({"member": member})
    if request.method == "PUT":
        if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("administrator"):
            return _json_error("Administrator access required", 403)
        payload = request.get_json(silent=True) or {}
        if "password" in payload and str(payload.get("password") or "").strip():
            ok, message = _validate_password_strength(str(payload.get("password") or ""))
            if not ok:
                return _json_error(message, 400)
        try:
            updated = crm.update_team_member(member_id, payload)
        except Exception as exc:
            return _json_from_exception(exc, status=400, prefix="Unable to update team member")
        if not updated:
            return _json_error("Team member not found", 404)
        try:
            _sync_team_member_to_auth_store(updated or {}, password=str(payload.get("password") or "") or None)
        except Exception as exc:
            return _json_from_exception(exc, status=400, prefix="Unable to configure auth account for team member")
        return _json_ok({"member": updated})
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("administrator"):
        return _json_error("Administrator access required", 403)
    target_member = crm.get_team_member(member_id)
    if target_member and str(target_member.get("role") or "").lower() == "administrator":
        team_rows = (crm.get_team(limit=2000) or {}).get("team") or []
        active_admins = [
            row for row in team_rows
            if str(row.get("role") or "").lower() == "administrator"
            and str(row.get("status") or "").lower() == "active"
        ]
        if len(active_admins) <= 1:
            return _json_error("Cannot disable the last active administrator account.", 409)
    try:
        deleted = crm.delete_team_member(member_id)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to disable team member")
    if not deleted:
        return _json_error("Team member not found", 404)
    try:
        member = crm.get_team_member(member_id)
        if member:
            _sync_team_member_to_auth_store(member)
    except Exception:
        pass
    return _json_ok({"deleted": True, "id": member_id})


# ---------------------------------------------------------------------------
# Automation run / progress endpoints (for future real-time UI integration)
# ---------------------------------------------------------------------------


@app.route("/api/progress/runs", methods=["GET", "POST"])
def automation_runs():
    if request.method == "GET":
        if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
            return _json_error("Authentication required", 401)
        limit = int(request.args.get("limit", 50))
        return _json_ok(crm.get_automation_runs(limit=limit))
    if _auth_role_rank((getattr(g, "auth_session", {}) or {}).get("role")) < _auth_role_rank("member"):
        return _json_error("Authentication required", 401)
    payload = request.get_json(silent=True) or {}
    try:
        created = crm.create_automation_run(payload)
    except Exception as exc:
        return _json_from_exception(exc, status=400, prefix="Unable to create automation run")
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
