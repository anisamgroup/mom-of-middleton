# MOM of Middleton website

- `index.html` – the site (built from the shared page source by `build.py`).
- `netlify/functions/estimate.mjs` – takes the price-form request and creates the customer + estimate in ServiceMonster.
- Every request is also saved in Netlify Forms (form name `estimate`) as a backup; turn on email notifications for it in Netlify.

## Netlify environment variables (entered by Marco, never committed)
| Variable | What |
|---|---|
| `SM_USERNAME` / `SM_PASSWORD` | ServiceMonster API user (Settings → API Users, role "Super User") |
| `SM_ITEM_LANAI` etc. | Only if a ServiceMonster service name changes |
| `SM_DRY_RUN` | `1` = test without writing to ServiceMonster |
