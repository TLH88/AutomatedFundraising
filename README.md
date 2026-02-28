# AutomatedFundraising
Webapp designed to assist non-profit find donors, contact them directly, and manage the relationship once established. 

## Security Hygiene

- Never commit secrets, API keys, or credentials to source control.
- Keep personal notes files local only (for example `AutomatedFundraisingProjNotes.txt` is gitignored).
- Run local secret scan before commits:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/secret_scan.ps1
```

## CI Quality Gates

- Pull requests and pushes to `main`/`master` run:
  - `fundraising_app/scripts/pre_deploy_check.py`
  - auth/permission tests in `fundraising_app/tests`
  - regression checks in `fundraising_app/scripts/regression_auth_analytics.py`

## Operational Runbooks

- Operational response guides are in `runbooks/`.
