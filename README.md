# MOM of Middleton website

- `index.html` – the site (built from the shared page source by `build.py`).
- `netlify/functions/estimate.mjs` – takes the price-form request, prices it on the server, and sends two emails through Resend:
  1. to the customer: their estimate (price, what's included, Protection Plan rates for their home), reply-to momofmiddleton@gmail.com
  2. to momofmiddleton@gmail.com: the customer's details, reply-to the customer
  Each estimate gets a number like `MOM-EST-260930-4971`.
- `netlify/lib/servicemonster.mjs` – ServiceMonster account + estimate creation. **Switched off** (needs a ServiceMonster plan with API access). Turn on with `SM_ENABLED=1`.
- Every request is also saved in Netlify Forms (form name `estimate`) as a backup.
- `plan/index.html` + `netlify/functions/sign-plan.mjs` – **momofmiddleton.com/plan**: customers pick home type and plan level, read the
  MOM Home Investment Protection Plan agreement and sign on screen. The function fills `plan/MOM-Protection-Plan-Agreement.pdf`
  (v3) with their details, plan, drawn signature and an e-signature record, and emails the signed PDF to the customer and the office.
  MOM lines are filled in automatically ("Accepted electronically by MOM of Middleton"), so no countersigning is needed. Backup in Netlify Forms (`plan-signup`). Uses `pdf-lib` (package.json).
  If the agreement wording changes, replace the PDF (same field names) **and** the text on `plan/index.html`.

## Netlify environment variables (entered in Netlify, never committed)
| Variable | What |
|---|---|
| `RESEND_API_KEY` | Resend API key, "Sending access" (Resend account momofmiddleton; domain momofmiddleton.com verified Sept 30, 2026) |
| `EMAIL_FROM` (or `FROM_EMAIL`) | Optional. Default `MOM of Middleton <estimates@momofmiddleton.com>` (no mailbox needed) |
| `OFFICE_EMAIL` (or `OWNER_EMAIL`) | Optional. Default `momofmiddleton@gmail.com` |
| `DRY_RUN` | `1` = price only, send nothing |
| `SM_ENABLED`, `SM_USERNAME`, `SM_PASSWORD`, `SM_ITEM_*` | Only if ServiceMonster API access is added later |

## Accessibility rule (every change, every page)
Before publishing any change, check these six basics (target: WCAG 2.1 AA):
1. Every image that carries information has a real description (alt text); decorative icons are hidden from screen readers (`aria-hidden="true"`).
2. Text has enough contrast with its background (4.5:1 for normal text, 3:1 for large text).
3. Every page, link, button and form works with the keyboard alone, with a visible focus outline. Never remove the outline without a replacement.
4. Every form field has a visible label tied to it (`<label for=…>`).
5. Every video has captions (`<track kind="captions">`, or captions turned on in the YouTube/Vimeo embed).
6. Every page footer links to `/accessibility/`, the accessibility statement with phone and email for help. New pages also go in sitemap.xml.
Run an automated check (axe) on changed pages before pushing; Claude does this automatically.
