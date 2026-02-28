# Live Launch Preparation Checklist (Non-Technical Guide)

Last updated: 2026-02-26

This checklist is written for a business owner or operator. It focuses on making launch safe, smooth, and repeatable.

## What this checklist covers

- Getting your accounts and keys ready
- Confirming the app is configured correctly
- Testing the important workflows before launch
- Deploying the app to a live environment
- Verifying everything works after launch

## Before You Begin (What You Need)

Make sure you have:

- Access to the GitHub repository
- Access to your hosting provider (where the app will run)
- Access to Supabase (database)
- Access to Google Cloud (Places API key)
- Access to OpenAI (LLM features)
- Access to SendGrid (email sending)
- Access to Apollo (optional contact enrichment)

Keep all passwords and API keys in a secure password manager.

## Part 1 - Account and API Setup (Do This First)

### 1. Supabase (Database)

- [ ] Confirm you can log into Supabase
- [ ] Open your project
- [ ] Confirm tables exist and contain expected data
- [ ] Confirm latest migrations have been applied (especially `organizations` fields for address/contact data)
- [ ] Confirm service key and publishable key are stored securely

### 2. Google Places API (Discovery Search)

- [ ] Confirm billing is enabled in Google Cloud
- [ ] Confirm `Places API (New)` is enabled
- [ ] Confirm your API key is active
- [ ] Restrict the key to the required APIs only
- [ ] Set quota limits (recommended for cost control)
- [ ] Set budget alerts in Google Cloud billing

### 3. OpenAI API (LLM Planning / Justification)

- [ ] Confirm API credits are available
- [ ] Confirm the key is active (no rate limit or quota issue)
- [ ] Confirm the key is stored securely

### 4. SendGrid (Email)

- [ ] Confirm billing/free tier limits are understood
- [ ] Verify sender domain or sender email
- [ ] Confirm API key is active and stored securely
- [ ] Confirm test email sends succeed

### 5. Apollo (Optional Contact Enrichment)

- [ ] Confirm API key is valid
- [ ] Confirm your plan includes the contact search/enrichment endpoints being used
- [ ] Confirm permissions do not return `403`

## Part 2 - Pre-Launch App Checklist (Local or Staging)

### 1. Start the app and verify health

- [ ] Start the server
- [ ] Open the app in a browser
- [ ] Confirm `/api/health` shows healthy status
- [ ] Confirm database source is correct (`supabase`)

### 2. Sign-in and role checks

- [ ] Test Administrator login
- [ ] Test Member login
- [ ] Test Visitor (not logged in)
- [ ] Confirm page permissions work as expected
- [ ] Confirm restricted pages are hidden for Visitor and Member (if configured)

### 3. Test core pages (basic smoke test)

- [ ] Landing page loads
- [ ] Dashboard loads
- [ ] Donors page loads and actions work
- [ ] Campaigns page loads and create/edit/delete works
- [ ] Funds Explorer search runs and preview results render
- [ ] Lead Generation page loads and filters work
- [ ] Communications page opens and can create a campaign draft
- [ ] Team page loads and admin actions work
- [ ] Settings page loads and saves changes

### 4. Test critical business workflows

- [ ] Record a donation manually
- [ ] Create a donor and link donation
- [ ] Create/edit/delete a campaign
- [ ] Run a Funds Explorer search
- [ ] Import selected results from Funds Explorer
- [ ] Send selected leads from Lead Generation to Communications
- [ ] Create a communications campaign from selected leads

### 5. Confirm branding and UI settings

- [ ] Theme toggle works (dark/light)
- [ ] Primary color setting updates UI elements
- [ ] Logo upload works and logo is not cut off
- [ ] Brand name change appears globally

## Part 3 - Deployment (Step-by-Step, Non-Technical)

This assumes your developer or hosting platform already has a standard way to deploy from GitHub.

### Step 1: Make a backup first

- [ ] In Supabase, export a backup (or confirm automated backups are enabled)
- [ ] Save a copy of any important configuration values in your password manager

### Step 2: Prepare your live environment settings

- [ ] Collect the required keys and values:
  - Supabase URL
  - Supabase publishable key
  - Supabase service key (if needed by backend/admin tasks)
  - Google Places API key
  - OpenAI API key
  - SendGrid API key
  - Apollo API key (optional)
- [ ] Add these values to your hosting provider’s environment variable settings
- [ ] Double-check there are no typos

### Step 3: Deploy the code

- [ ] Open your hosting provider dashboard
- [ ] Select the app/project
- [ ] Choose the latest approved GitHub branch/commit
- [ ] Click Deploy / Redeploy
- [ ] Wait for deployment to finish

### Step 4: Check deployment status

- [ ] Confirm the deployment shows “successful”
- [ ] Open the live site URL
- [ ] Refresh once to confirm the latest version loaded

### Step 5: Run post-deploy checks (must do)

- [ ] Open `/api/health` and confirm healthy status
- [ ] Confirm the landing page loads
- [ ] Log in as Administrator
- [ ] Open Dashboard, Donors, Campaigns, Funds Explorer, Communications
- [ ] Run one small Funds Explorer test search (small radius, small limit)
- [ ] Create one test campaign draft (do not send yet unless intended)

### Step 6: Final go-live confirmation

- [ ] Confirm branding/logo/theme appear correctly
- [ ] Confirm permissions for Visitor/Member/Admin behave correctly
- [ ] Confirm no obvious errors appear in the browser
- [ ] Confirm no deployment errors appear in hosting logs

## Part 4 - Day 1 Launch Monitoring (Recommended)

For the first 24-48 hours after launch:

- [ ] Check app health at least 2-3 times
- [ ] Watch Google Places usage/quota and costs
- [ ] Watch OpenAI usage/quota
- [ ] Watch SendGrid usage and delivery issues
- [ ] Check Supabase logs for API/database errors
- [ ] Collect user feedback on broken buttons or confusing steps

## Part 5 - Rollback Plan (If Something Goes Wrong)

If a release causes issues:

- [ ] Re-deploy the last known good version in your hosting provider
- [ ] Confirm `/api/health` is healthy again
- [ ] Test login and the most-used pages
- [ ] Notify team members that rollback is complete
- [ ] Log the issue and schedule a fix before trying another release

## Quick Launch Sign-Off

Use this final checklist right before launch:

- [ ] Backups confirmed
- [ ] Keys configured correctly
- [ ] Deployment succeeded
- [ ] Health check passed
- [ ] Admin login passed
- [ ] Core workflows tested
- [ ] Monitoring plan in place
- [ ] Rollback plan ready
