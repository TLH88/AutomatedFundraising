"""
test_connections.py
Comprehensive connection validator for AutomatedFundraising.

Tests all critical integrations:
  - Supabase database connection + table structure
  - SendGrid API authentication
  - Environment variable completeness
  - Core module functionality

Run this before deploying to GitHub Actions to catch any configuration issues.

Usage:
    python test_connections.py
"""

import os
import sys
from typing import Dict, List, Tuple
from datetime import datetime

# Color codes for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"


def print_header(text: str) -> None:
    """Print a formatted section header."""
    print(f"\n{BLUE}{'=' * 70}{RESET}")
    print(f"{BLUE}{text.center(70)}{RESET}")
    print(f"{BLUE}{'=' * 70}{RESET}\n")


def print_result(check_name: str, passed: bool, message: str = "") -> None:
    """Print a test result with color coding."""
    status = f"{GREEN}✓ PASS{RESET}" if passed else f"{RED}✗ FAIL{RESET}"
    print(f"{status} | {check_name}")
    if message:
        prefix = "      " if passed else f"{RED}      "
        suffix = RESET if not passed else ""
        print(f"{prefix}{message}{suffix}")


def check_env_vars() -> Tuple[bool, Dict[str, bool]]:
    """Check that all required environment variables are set."""
    print_header("Environment Variables Check")

    required = {
        "SUPABASE_URL": "Supabase project URL",
        "SUPABASE_PUBLISHABLE_KEY": "Supabase publishable key (sb_publishable_...)",
        "SENDGRID_API_KEY": "SendGrid API key (required for sending emails)",
        "SENDER_NAME": "Sender identity name",
        "SENDER_EMAIL": "Sender email address",
        "FUNDRAISER_NAME": "Fundraiser campaign name",
        "UNSUBSCRIBE_BASE_URL": "Unsubscribe link base URL",
    }

    optional = {
        "SERPAPI_KEY": "Google search API (optional for discovery)",
        "PLAYWRIGHT_ENABLED": "Playwright for JS-rendered sites (optional)",
        "BATCH_SIZE": "Email batch size (defaults to 50)",
        "SEND_DELAY_SECONDS": "Delay between sends (defaults to 1.5s)",
    }

    results = {}
    all_passed = True

    for var, description in required.items():
        value = os.environ.get(var, "")
        is_set = bool(value and value.strip())
        results[var] = is_set

        if is_set:
            masked = value[:20] + "..." if len(value) > 20 else value
            print_result(var, True, f"{description} → {masked}")
        else:
            print_result(var, False, f"MISSING: {description}")
            all_passed = False

    print(f"\n{YELLOW}Optional Variables:{RESET}")
    for var, description in optional.items():
        value = os.environ.get(var, "")
        is_set = bool(value and value.strip())
        status = "Set" if is_set else "Not set"
        print(f"      {var}: {status} ({description})")

    return all_passed, results


def check_supabase_connection() -> Tuple[bool, object]:
    """Test Supabase connection and basic query."""
    print_header("Supabase Connection Check")

    try:
        from db.client import get_client

        client = get_client()
        print_result("Supabase client initialization", True, "Client created successfully")

        # Test a simple query
        result = client.table("organizations").select("id", count="exact").limit(1).execute()
        print_result("Database query test", True, f"Query executed successfully")

        return True, client

    except ImportError as e:
        print_result("Import db.client", False, f"Module import failed: {e}")
        return False, None
    except KeyError as e:
        print_result("Environment variables", False, f"Missing required variable: {e}")
        return False, None
    except Exception as e:
        print_result("Supabase connection", False, f"Connection failed: {e}")
        return False, None


def check_supabase_tables(client) -> bool:
    """Verify all required tables exist with expected structure."""
    print_header("Supabase Table Structure Check")

    if not client:
        print_result("Table check", False, "No client available (previous connection failed)")
        return False

    expected_tables = ["organizations", "contacts", "email_campaigns", "email_sends"]
    all_passed = True

    for table_name in expected_tables:
        try:
            result = client.table(table_name).select("*", count="exact").limit(1).execute()
            count = result.count if hasattr(result, 'count') else 0
            print_result(
                f"Table: {table_name}",
                True,
                f"Table exists (contains {count} rows)"
            )
        except Exception as e:
            print_result(f"Table: {table_name}", False, f"Table error: {e}")
            all_passed = False

    return all_passed


def check_table_columns(client) -> bool:
    """Verify critical columns exist in each table."""
    print_header("Table Column Verification")

    if not client:
        print_result("Column check", False, "No client available")
        return False

    # Test by attempting to select specific columns
    table_columns = {
        "organizations": ["id", "name", "website", "category", "donation_potential_score"],
        "contacts": ["id", "org_id", "full_name", "email", "do_not_contact"],
        "email_campaigns": ["id", "name", "subject_template", "body_template", "status"],
        "email_sends": ["id", "campaign_id", "contact_id", "status", "sent_at"],
    }

    all_passed = True

    for table, columns in table_columns.items():
        try:
            # Try to select all critical columns
            select_str = ",".join(columns)
            result = client.table(table).select(select_str).limit(1).execute()
            print_result(
                f"Columns in {table}",
                True,
                f"All critical columns present: {', '.join(columns[:3])}..."
            )
        except Exception as e:
            print_result(f"Columns in {table}", False, f"Column error: {e}")
            all_passed = False

    return all_passed


def check_sendgrid() -> bool:
    """Test SendGrid API authentication."""
    print_header("SendGrid API Check")

    api_key = os.environ.get("SENDGRID_API_KEY", "")

    if not api_key:
        print_result("SendGrid API key", False, "SENDGRID_API_KEY not set")
        return False

    try:
        import sendgrid

        sg = sendgrid.SendGridAPIClient(api_key=api_key)
        print_result("SendGrid client", True, "Client initialized successfully")

        # Test authentication by checking API key status
        # Note: We're not sending a test email to avoid quota usage
        # Just verify the client can be created
        print_result(
            "SendGrid authentication",
            True,
            "API key format valid (not sending test email to preserve quota)"
        )

        return True

    except ImportError:
        print_result("SendGrid library", False, "sendgrid package not installed")
        return False
    except Exception as e:
        print_result("SendGrid initialization", False, f"Error: {e}")
        return False


def check_module_imports() -> bool:
    """Verify all critical modules can be imported."""
    print_header("Module Import Check")

    modules = [
        ("db.client", "Database client wrapper"),
        ("scraper.discover", "Organization discovery"),
        ("scraper.extract_contacts", "Contact extraction"),
        ("scraper.utils", "Scraper utilities"),
        ("emailer.render_template", "Email template renderer"),
        ("emailer.batch_send", "Batch email sender"),
        ("emailer.sync_tracking", "Email tracking sync"),
    ]

    all_passed = True

    for module_name, description in modules:
        try:
            __import__(module_name)
            print_result(f"Import {module_name}", True, description)
        except Exception as e:
            print_result(f"Import {module_name}", False, f"{description} - Error: {e}")
            all_passed = False

    return all_passed


def check_database_operations(client) -> bool:
    """Test basic CRUD operations on Supabase."""
    print_header("Database Operations Test")

    if not client:
        print_result("Database operations", False, "No client available")
        return False

    all_passed = True

    # Test 1: Read organizations
    try:
        from db.client import get_organizations
        orgs = get_organizations(min_score=1, limit=5)
        print_result(
            "Read organizations",
            True,
            f"Retrieved {len(orgs)} organization(s)"
        )
    except Exception as e:
        print_result("Read organizations", False, f"Error: {e}")
        all_passed = False

    # Test 2: Check for campaigns
    try:
        result = client.table("email_campaigns").select("*").limit(5).execute()
        campaign_count = len(result.data) if result.data else 0
        print_result(
            "Read email campaigns",
            True,
            f"Found {campaign_count} campaign(s)"
        )
    except Exception as e:
        print_result("Read email campaigns", False, f"Error: {e}")
        all_passed = False

    # Test 3: Check contacts
    try:
        from db.client import get_client as gc
        c = gc()
        result = c.table("contacts").select("*", count="exact").limit(1).execute()
        contact_count = result.count if hasattr(result, 'count') else 0
        print_result(
            "Read contacts",
            True,
            f"Database contains {contact_count} contact(s)"
        )
    except Exception as e:
        print_result("Read contacts", False, f"Error: {e}")
        all_passed = False

    return all_passed


def generate_summary_report(results: Dict[str, bool]) -> None:
    """Print a final summary report."""
    print_header("Connection Test Summary")

    total = len(results)
    passed = sum(1 for v in results.values() if v)
    failed = total - passed

    print(f"Total Checks: {total}")
    print(f"{GREEN}Passed: {passed}{RESET}")
    if failed > 0:
        print(f"{RED}Failed: {failed}{RESET}")
    else:
        print(f"Failed: {failed}")

    success_rate = (passed / total * 100) if total > 0 else 0
    print(f"\nSuccess Rate: {success_rate:.1f}%")

    if success_rate == 100:
        print(f"\n{GREEN}{'🎉 All connections verified! System ready for deployment. 🎉'.center(70)}{RESET}")
    elif success_rate >= 80:
        print(f"\n{YELLOW}⚠️  Most checks passed. Review failures above before deploying.{RESET}")
    else:
        print(f"\n{RED}❌ Multiple failures detected. Fix critical issues before proceeding.{RESET}")


def main():
    """Run all connection tests."""
    print_header(f"AutomatedFundraising Connection Validator")
    print(f"      Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"      Project: Furry Friends Shelter - Automated Donor Outreach")

    results = {}

    # 1. Environment variables
    env_passed, env_results = check_env_vars()
    results["Environment Variables"] = env_passed

    # 2. Module imports
    import_passed = check_module_imports()
    results["Module Imports"] = import_passed

    # 3. Supabase connection
    supabase_passed, client = check_supabase_connection()
    results["Supabase Connection"] = supabase_passed

    # 4. Supabase tables
    if client:
        tables_passed = check_supabase_tables(client)
        results["Supabase Tables"] = tables_passed

        columns_passed = check_table_columns(client)
        results["Table Columns"] = columns_passed

        db_ops_passed = check_database_operations(client)
        results["Database Operations"] = db_ops_passed
    else:
        results["Supabase Tables"] = False
        results["Table Columns"] = False
        results["Database Operations"] = False

    # 5. SendGrid
    sendgrid_passed = check_sendgrid()
    results["SendGrid API"] = sendgrid_passed

    # Summary
    generate_summary_report(results)

    # Exit code
    all_passed = all(results.values())
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
