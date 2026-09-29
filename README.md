# MOM of Middleton website

- `index.html` – the site (built from the shared page source by `build.py`).
- `netlify/functions/estimate.mjs` – takes the price-form request, emails the customer their estimate (and Marco a lead notice) through Resend, and, if ServiceMonster API credentials are set, also creates the customer + estimate in ServiceMonster.
- Every request is also saved in Netlify Forms (form name `estimate`) as a backup; turn on email notifications for it in Netlify.

## Netlify environment variables (entered by Marco, never committed)
| Variable | What |
|---|---|
| `RESEND_API_KEY` | From resend.com (free plan); sends the estimate emails |
| `FROM_EMAIL` | e.g. `MOM of Middleton <estimates@momofmiddleton.com>` (domain verified in Resend) |
| `OWNER_EMAIL` | Where new-request notices go (default momofmiddleton@gmail.com) |
| `SM_USERNAME` / `SM_PASSWORD` | Optional. ServiceMonster API user (needs the Grow plan). Leave unset until then |
| `SM_ITEM_LANAI` etc. | Only if a ServiceMonster service name changes |
| `SM_DRY_RUN` | `1` = test without writing to ServiceMonster |
