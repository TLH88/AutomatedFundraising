# AutomatedFundraising - Connections & Configuration Guide

**Last Updated:** February 22, 2026
**Project:** Furry Friends Shelter - Automated Donor Outreach
**Supabase Project:** [https://supabase.com/dashboard/project/kjbbdqqqloljzxikblwa](https://supabase.com/dashboard/project/kjbbdqqqloljzxikblwa)

---

## Quick Test

Run the connection validator to test all integrations:

```bash
python test_connections.py
```

This will verify:
- ✅ All environment variables are set
- ✅ Supabase connection is working
- ✅ All database tables exist and are accessible
- ✅ SendGrid API is authenticated
- ✅ All Python modules import correctly

---

## 1. Supabase Database Connection

### Connection Details

| Setting | Value |
|---------|-------|
| **Project URL** | `https://kjbbdqqqloljzxikblwa.supabase.co` |
| **Project ID** | `kjbbdqqqloljzxikblwa` |
| **Region** | (Check your Supabase dashboard) |
| **Key Type** | Publishable Key (`sb_publishable_...`) |

### Environment Variables

```bash
SUPABASE_URL=https://kjbbdqqqloljzxikblwa.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_U-wrJ6Pu5DhmSDcon6JyAg_0cndO0ab
```

### Tables Created

✅ Verify these tables exist in your Supabase project:

- [x] `organizations` - Discovered orgs with donation scores
- [x] `contacts` - Extracted contact information
- [x] `email_campaigns` - Campaign templates
- [x] `email_sends` - Email send tracking log

### Table Structure Verification

#### `organizations` Table
Expected columns:
- `id` (UUID, PK)
- `name` (TEXT)
- `website` (TEXT)
- `category` (TEXT)
- `donation_potential_score` (INTEGER, 1-10)
- `notes` (TEXT)
- `source_url` (TEXT)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Unique constraint:** `name, website`

#### `contacts` Table
Expected columns:
- `id` (UUID, PK)
- `org_id` (UUID, FK → organizations)
- `full_name` (TEXT)
- `title` (TEXT)
- `email` (TEXT)
- `phone` (TEXT)
- `justification` (TEXT)
- `confidence` (TEXT: high/medium/low)
- `do_not_contact` (BOOLEAN, default: false)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Unique constraint:** `email`

#### `email_campaigns` Table
Expected columns:
- `id` (UUID, PK)
- `name` (TEXT)
- `subject_template` (TEXT)
- `body_template` (TEXT)
- `status` (TEXT: draft/active/paused/completed)
- `created_at` (TIMESTAMPTZ)

#### `email_sends` Table
Expected columns:
- `id` (UUID, PK)
- `campaign_id` (UUID, FK → email_campaigns)
- `contact_id` (UUID, FK → contacts)
- `sent_at` (TIMESTAMPTZ)
- `status` (TEXT: pending/sent/bounced/opened/replied/unsubscribed)
- `error_message` (TEXT)
- `tracking_pixel_id` (TEXT)
- `created_at` (TIMESTAMPTZ)

### Row-Level Security (RLS)

**Important:** For the publishable key to work properly, RLS policies must be configured.

**Recommended Policy (for service-side access):**

If you're using the **publishable key** (`sb_publishable_...`), you need to set up RLS policies that allow access. Alternatively, you could use the **service role key** (starts with `eyJ...`), which bypasses RLS.

**Current Setup:** Using publishable key per `.env.example`

Check RLS status in Supabase:
1. Go to **Authentication → Policies**
2. Ensure policies exist for each table OR
3. Consider switching to service role key for backend operations

### Testing Supabase Connection

```bash
python -c "from db.client import get_client; print('✓ Connected:', get_client().table('organizations').select('id').limit(1).execute())"
```

---

## 2. SendGrid Email Service

### Configuration

| Setting | Value |
|---------|-------|
| **Service** | SendGrid (transactional email) |
| **API Endpoint** | `https://api.sendgrid.com/v3/` |
| **Authentication** | API Key |

### Environment Variables

```bash
SENDGRID_API_KEY=SG.your-api-key-here
SENDER_NAME=Hope from Furry Friends
SENDER_EMAIL=hope@furryfriendswa.org
```

### Sender Verification

**Critical:** Before sending any emails, verify your sender email in SendGrid:

1. Go to [SendGrid Dashboard → Sender Authentication](https://app.sendgrid.com/settings/sender_auth)
2. Verify `hope@furryfriendswa.org` (or your chosen sender email)
3. Complete domain authentication if sending at scale

### Testing SendGrid Connection

```bash
python -c "import sendgrid; import os; sg = sendgrid.SendGridAPIClient(api_key=os.environ['SENDGRID_API_KEY']); print('✓ SendGrid connected')"
```

**Note:** This test validates the API key format but doesn't send a test email.

### SendGrid Features Used

- ✅ **Open Tracking** - 1x1 pixel tracking
- ✅ **Click Tracking** - Link click analytics
- ✅ **Bounce Handling** - Auto-flag bounced emails
- ✅ **Unsubscribe Detection** - Via event webhooks
- ✅ **Custom Arguments** - `send_id` for webhook correlation

### Email Activity API

The tracking sync script (`emailer/sync_tracking.py`) uses the SendGrid Email Activity API.

**Requirements:**
- SendGrid plan with Email Activity access (Pro or higher)
- API key with "Email Activity" read permission

Check your plan: [SendGrid Pricing](https://sendgrid.com/pricing/)

---

## 3. Optional: SerpAPI (Google Search)

### Configuration

Only needed if you want to dynamically discover organizations via Google search.

| Setting | Value |
|---------|-------|
| **Service** | SerpAPI |
| **Endpoint** | `https://serpapi.com/search` |
| **Free Tier** | 100 searches/month |

### Environment Variable

```bash
SERPAPI_KEY=your-serpapi-key-here
```

**If not set:** Discovery script falls back to seed list only (30+ orgs already hardcoded).

### Get a Key

1. Sign up at [https://serpapi.com](https://serpapi.com)
2. Copy your API key from the dashboard
3. Add to `.env`

### Testing SerpAPI

```bash
python -c "from scraper.discover import search_via_serpapi; print(search_via_serpapi('pet charity', num=1))"
```

---

## 4. Optional: Playwright (JavaScript Rendering)

### Configuration

Only needed if target websites use JavaScript to load content (e.g., React apps).

| Setting | Default |
|---------|---------|
| **Enabled** | `false` |
| **Browser** | Chromium (headless) |

### Environment Variable

```bash
PLAYWRIGHT_ENABLED=true  # Set to 'true' to enable
```

### Installation

If enabled, install Playwright browsers:

```bash
pip install playwright==1.49.0
playwright install chromium --with-deps
```

**Note:** Adds ~200MB download + slower scraping. Enable only if static scraping fails.

---

## 5. GitHub Actions Secrets

For automated workflows to run, configure these secrets in GitHub:

**Repository → Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value | Required |
|-------------|-------|----------|
| `SUPABASE_URL` | `https://kjbbdqqqloljzxikblwa.supabase.co` | ✅ Yes |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_U-wrJ6Pu5DhmSDcon6JyAg_0cndO0ab` | ✅ Yes |
| `SENDGRID_API_KEY` | Your SendGrid API key | ✅ Yes |
| `SENDER_NAME` | `Hope from Furry Friends` | ✅ Yes |
| `SENDER_EMAIL` | `hope@furryfriendswa.org` | ✅ Yes |
| `FUNDRAISER_NAME` | `2026 Animal Rescue Campaign` | ✅ Yes |
| `UNSUBSCRIBE_BASE_URL` | `https://furryfriendswa.org/unsubscribe` | ✅ Yes |
| `SERPAPI_KEY` | Your SerpAPI key | ⚠️ Optional |
| `PLAYWRIGHT_ENABLED` | `true` or `false` | ⚠️ Optional |

### Verifying GitHub Secrets

Once secrets are added, you can trigger a manual workflow run to test:

1. Go to **Actions** tab in GitHub
2. Select **Discover & Scrape Organizations**
3. Click **Run workflow**
4. Check the logs for errors

---

## 6. Local Development Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/TLH88/AutomatedFundraising.git
cd AutomatedFundraising
```

### Step 2: Create Virtual Environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Create `.env` File

```bash
cp .env.example .env
```

Edit `.env` with your actual values (use the template in [.env.example](.env.example)).

### Step 5: Load Environment Variables

**Windows (PowerShell):**
```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
```

**Windows (Command Prompt):**
```cmd
for /f "tokens=*" %i in (.env) do set %i
```

**macOS/Linux (Bash):**
```bash
export $(cat .env | xargs)
```

### Step 6: Test Connections

```bash
python test_connections.py
```

---

## 7. Connection Test Checklist

Use this checklist to verify each integration:

### Pre-Flight Checks

- [ ] `.env` file created and populated
- [ ] Virtual environment activated
- [ ] All dependencies installed (`pip install -r requirements.txt`)

### Supabase Connection

- [ ] Environment variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set
- [ ] Can import `db.client` module
- [ ] Can execute: `python -c "from db.client import get_client; get_client()"`
- [ ] All 4 tables exist: organizations, contacts, email_campaigns, email_sends
- [ ] Tables contain expected columns
- [ ] Can read from `organizations` table
- [ ] Can read from `contacts` table
- [ ] Can read from `email_campaigns` table

### SendGrid Connection

- [ ] Environment variable `SENDGRID_API_KEY` is set
- [ ] Sender email is verified in SendGrid dashboard
- [ ] Can import `sendgrid` module
- [ ] SendGrid client initializes without errors
- [ ] (Optional) Email Activity API is accessible for your plan

### Optional Services

- [ ] SerpAPI key set (if using Google search)
- [ ] Playwright installed (if `PLAYWRIGHT_ENABLED=true`)

### Module Functionality

- [ ] Can import all scraper modules (`scraper.discover`, `scraper.extract_contacts`)
- [ ] Can import all emailer modules (`emailer.batch_send`, `emailer.render_template`)
- [ ] Email templates exist in `emailer/templates/`

### GitHub Actions

- [ ] Repository created on GitHub
- [ ] Code pushed to `main` branch
- [ ] All secrets configured in repository settings
- [ ] Workflows are visible in Actions tab

---

## 8. Troubleshooting Common Issues

### Issue: "ModuleNotFoundError: No module named 'supabase'"

**Solution:**
```bash
pip install -r requirements.txt
```

### Issue: "KeyError: 'SUPABASE_URL'"

**Solution:** Environment variables not loaded. Create `.env` file and load it:
```bash
cp .env.example .env
# Edit .env with your values
# Then load it (see Step 5 above)
```

### Issue: "403 Forbidden" from Supabase

**Solution:** RLS policies are blocking access. Either:
1. Add RLS policies for the publishable key, OR
2. Use the service role key instead (less secure, backend-only)

### Issue: "SendGrid 401 Unauthorized"

**Solution:**
- Verify `SENDGRID_API_KEY` is correct
- Check that the API key has not expired
- Ensure API key has "Mail Send" permissions

### Issue: "No rows returned from Supabase"

**Solution:** Tables exist but are empty. This is normal if:
1. You haven't run the discovery script yet (`python -m scraper.discover`)
2. You haven't manually inserted test data

---

## 9. Next Steps After Verification

Once all connections are verified (100% pass rate on `test_connections.py`):

1. **Seed the database** - Run discovery to populate organizations:
   ```bash
   python -m scraper.discover
   ```

2. **Extract contacts** - Scrape websites for contact info:
   ```bash
   python -c "from scraper.extract_contacts import run_extraction; run_extraction(min_score=5)"
   ```

3. **Create a campaign** - Add a campaign record in Supabase:
   - Go to Supabase → Table Editor → `email_campaigns`
   - Insert a new row with `cold_outreach.txt` template content
   - Set `status` to `active`

4. **Test email sending** (dry run with a small batch):
   ```bash
   python -m emailer.batch_send --campaign-id <CAMPAIGN_UUID> --limit 1
   ```

5. **Deploy to GitHub** - Push code and configure Actions secrets

6. **Monitor** - Check Supabase `email_sends` table for delivery status

---

## 10. Support & Documentation

- **Supabase Docs:** [https://supabase.com/docs](https://supabase.com/docs)
- **SendGrid Docs:** [https://docs.sendgrid.com](https://docs.sendgrid.com)
- **Project README:** [README.md](README.md)
- **Build Plan:** [../PLAN_OF_ACTION.md](../PLAN_OF_ACTION.md)

---

**Status:** Ready for testing ✅
**Last Verified:** [Add date after running test_connections.py]