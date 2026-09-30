# MOM of Middleton website

- `index.html` – the site (built from the shared page source by `build.py`).
- `netlify/functions/estimate.mjs` – takes the price-form request, prices it on the server, and sends two emails through Resend:
  1. to the customer: their estimate (price, what's included, Protection Plan rates for their home), reply-to momofmiddleton@gmail.com
  2. to momofmiddleton@gmail.com: the customer's details, reply-to the customer
  Each estimate gets a number like `MOM-EST-260930-4971`.
- `netlify/lib/servicemonster.mjs` – ServiceMonster account + estimate creation. **Switched off** (needs a ServiceMonster plan with API access). Turn on with `SM_ENABLED=1`.
- Every request is also saved in Netlify Forms (form name `estimate`) as a backup.

## Netlify environment variables (entered in Netlify, never committed)
| Variable | What |
|---|---|
| `RESEND_API_KEY` | Resend API key, "Sending access" (Resend account momofmiddleton; domain momofmiddleton.com verified Sept 30, 2026) |
| `EMAIL_FROM` | Optional. Default `MOM of Middleton <estimates@momofmiddleton.com>` (no mailbox needed) |
| `OFFICE_EMAIL` | Optional. Default `momofmiddleton@gmail.com` |
| `DRY_RUN` | `1` = price only, send nothing |
| `SM_ENABLED`, `SM_USERNAME`, `SM_PASSWORD`, `SM_ITEM_*` | Only if ServiceMonster API access is added later |
