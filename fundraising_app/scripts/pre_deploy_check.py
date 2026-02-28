"""
Pre-deployment checks for local validation before committing/pushing.

Checks:
- Python compile
- Core imports
- Flask API smoke tests
- Optional Supabase/SendGrid connection checks (if env configured)
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def run(cmd: list[str], label: str, optional: bool = False) -> bool:
    print(f"\n== {label} ==")
    result = subprocess.run(cmd, cwd=ROOT.parent, text=True, capture_output=True)
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr:
        print(result.stderr.strip())
    ok = result.returncode == 0
    if ok:
        print(f"PASS: {label}")
        return True
    if optional:
        print(f"WARN: {label} (optional check failed)")
        return True
    print(f"FAIL: {label}")
    return False


def main() -> int:
    all_ok = True
    write_checks = str(os.environ.get("SMOKE_TEST_ENABLE_WRITE_CHECKS", "")).strip().lower() in {"1", "true", "yes", "on"}

    print("\n== Security rotation reminder ==")
    rotation_confirmed = str(os.environ.get("KEY_ROTATION_CONFIRMED", "")).strip().lower() in {"1", "true", "yes"}
    if rotation_confirmed:
        print("PASS: Key rotation confirmed via KEY_ROTATION_CONFIRMED=true")
    else:
        print("WARN: KEY_ROTATION_CONFIRMED is not set. Rotate exposed API keys before production deployment.")

    all_ok &= run([sys.executable, "-m", "compileall", "fundraising_app"], "Python compile")
    all_ok &= run(
        [sys.executable, "-c", "import flask, requests, bs4, feedparser; print('core imports ok')"],
        "Core imports",
    )
    all_ok &= run(
        [sys.executable, "fundraising_app/scripts/smoke_test_server.py"],
        f"Flask API smoke tests (write checks {'enabled' if write_checks else 'disabled'})",
    )

    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_PUBLISHABLE_KEY"):
        all_ok &= run(
            [sys.executable, "fundraising_app/scripts/test_connections.py"],
            "External connection checks",
            optional=True,
        )
    else:
        print("\n== External connection checks ==")
        print("SKIP: Supabase env vars not set locally")

    print("\nSummary:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
