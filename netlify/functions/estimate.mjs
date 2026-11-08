// Website price form -> estimate emails (sent through Resend).
//
// For every request this function sends two emails:
//   1. To the customer: their price, what's included, and the Protection Plan rates for their home.
//   2. To the office (momofmiddleton@gmail.com): the customer's details, so Marco can enter them.
//
// Netlify environment variables (entered in Netlify, never committed):
//   RESEND_API_KEY  – Resend API key (Sending access), domain momofmiddleton.com verified in Resend
// Optional:
//   EMAIL_FROM (or FROM_EMAIL)   – sender (default "MOM of Middleton <estimates@momofmiddleton.com>")
//   OFFICE_EMAIL (or OWNER_EMAIL) – where new requests and customer replies go (default momofmiddleton@gmail.com)
//   COPY_EMAIL – optional hidden copy (BCC) of every office request email, e.g. so CL can enter it in ServiceMonster
//   DRY_RUN=1       – validate and price only, send nothing
//
// ServiceMonster (switched off): if MOM later gets ServiceMonster API access, set SM_ENABLED=1
// plus SM_USERNAME / SM_PASSWORD and the function will also create the account + estimate there.
// The emails go out either way.

import { createServiceMonsterEstimate } from '../lib/servicemonster.mjs';

const PRICES = { pv: 248, s1: 298, s2: 398 };
const FULL = { pv: 298, s1: 348, s2: 448 };
const PKG = 50, LANAI = 50, FENCE_SIDE = 25; // fence cleaning: $25 per side of the yard, up to 3 sides
const HOME_NAMES = { pv: 'Patio villa', s1: '1-story home', s2: '2-story home' };
const PLANS = [
  { name: 'Standard Protection', freq: '3 cleanings a year, every 4 months', rate: { pv: 62.5, s1: 79, s2: 99 } },
  { name: 'Enhanced Protection', freq: '4 cleanings a year, every 3 months', rate: { pv: 79, s1: 99, s2: 125 } },
  { name: 'Premium Protection', freq: '6 cleanings a year, every 2 months', rate: { pv: 109, s1: 139, s2: 175 } },
];
const PHONE = '352-808-2082';
const WASH_TEXT = 'Removal of all dirt, mold and mildew from exterior walls, windows and sills, plus cobwebs and bugs (except wasp nests). We soft wash: low-pressure water with professional cleaning agents that kill mold and help your paint last longer.';
const LINE_TEXT = {
  pv: WASH_TEXT, s1: WASH_TEXT, s2: WASH_TEXT,
  pkg: 'Driveway, walkway, entry, back patio, exterior gutters, oxidation streaks (tiger stripes) and screen lanai. Removes dirt, mold, mildew and most bugs.',
  lanai: 'Lanai/patio area extending past the roofline.',
  fence: 'Vinyl or metal fence cleaning, $25 per side of the yard (back, left, right).',
};
const BEFORE_VISIT = "Water plants and grass near the areas we're cleaning at least 1 hour before we arrive and for 3 days after; some browning may occur. Move cars, furniture, rugs, potted plants and hanging baskets away from the service areas.";
const WAIVER = 'By approving this estimate, verbally or otherwise, you release and hold harmless MOM of Middleton and its employees and agents from claims arising from the services, including property or plant damage, discoloration or fading of surfaces, damage to light fixtures, outlets or key sockets, personal injury, and events beyond our control. You accept the risks of exterior cleaning, are responsible for insuring your own property, and are responsible for any permits or law-enforcement personnel the job requires.';

// Service terms customers sign when they book on the website (from MOM's ServiceMonster order disclaimer, Nov 8, 2026).
const TERMS_VERSION = 'MOM-TRM-261108b';
const TERMS = [
  'Cleaning with chemicals: please read the instruction email; if you did not receive it, contact us right away and check your spam folder.',
  'Water the plants and grass around the areas being cleaned at least 1 hour before our visit and for 3 days afterward; some browning may occur.',
  'All cars, furniture, rugs, potted plants and hanging baskets must be moved away from the areas being serviced to avoid damage. MOM of Middleton is not liable for property damage or plant damage.',
  'Payment: a 50% deposit is due when you book; the remaining 50% is due when the job is complete. Protection Plan (maintenance) visits are billed automatically.',
  'Cancellation: please give at least 72 hours\' notice to cancel or reschedule.',
  'Waiver of liability: The Company (MOM of Middleton) agrees to provide the services described in the estimate. In consideration for the services provided, the Client agrees to release, indemnify and hold harmless the Company, its agents, employees, officers and representatives from any and all liability, claims, demands, actions, causes of action, costs and expenses arising out of or related to the services provided by the Company, including but not limited to: any damage to property, including discoloration, fading or other alterations to surfaces, light fixtures, power outlets, key sockets, etc.; any injuries or harm to persons, including employees, agents or representatives of the Client or any third parties present where the services are performed; and any damage or harm caused by unforeseen circumstances, acts of nature or other events beyond the control of the Company.',
  'The Client acknowledges that the services may involve certain risks, including the potential for damage to property or harm to individuals. The Client voluntarily assumes all such risks and releases the Company from any and all claims arising out of or related to such risks.',
  'The Client is solely responsible for obtaining and maintaining adequate insurance coverage for any potential loss or damage to their property. The Client is responsible for obtaining and paying for any permits required and any law enforcement personnel for the job.',
];

// "Getting ready" instructions sent right away when a customer books on the website
// (same guidelines as the ServiceMonster Appointment Confirmation email, Nov 8, 2026).
const PREP = [
  'Please water landscaping and plants around the cleaning area before we arrive. If you have an irrigation system, running it for about 10–15 minutes beforehand helps.',
  'Remove or move outdoor furniture, rugs, potted plants, decorations and other personal items away from the areas being cleaned.',
  "For house washing, please move any delicate items away from the home's exterior if possible.",
  'If lawn, landscape, pool or other outdoor service providers are scheduled, please avoid having them come the same day as your cleaning.',
  'For your comfort and safety, please stay clear of the immediate work area while we clean.',
  'Please keep pets indoors or away from the work area until surfaces have dried.',
];
const PREP_NOTE = [
  'Our cleaning process uses professional-grade cleaning solutions made for exterior surfaces. They are heavily diluted and applied to safely remove dirt, algae, mildew and organic growth. Please avoid touching freshly treated surfaces until they have dried and been naturally rinsed.',
  'While rare, some sensitive plants or grass may show minor stress after cleaning. Watering before and after the service (for 3 days afterward) greatly reduces this and helps landscaping recover quickly.',
];

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

const clean = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanNote = (s) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, 1000);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (v) => '$' + (v % 1 ? v.toFixed(2) : v);

// Estimate number in the Ani Sam Group code style: MOM-EST-YYMMDD-#### (Florida date).
function estimateNo() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: '2-digit', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const n = String(Math.floor(1000 + Math.random() * 9000));
  return `MOM-EST-${parts.year}${parts.month}${parts.day}-${n}`;
}

function longDate() {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
}

// ---------- Emails ----------

const C = { ink: '#17141C', soft: '#57525E', line: '#E1DDE3', bg: '#F7F6F3', spray: '#6A0B9E', crimson: '#9A0000', sun: '#FFC800', band: '#0B0B0C' };
const FONT = "font-family:'Segoe UI',Verdana,Arial,sans-serif;";

function shell(inner, footer) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden;${FONT}color:${C.ink};">
<tr><td style="background:#0B0B0C;padding:14px 18px;border-bottom:4px solid #FFC800;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:150px;"><a href="https://momofmiddleton.com/" style="text-decoration:none;"><img src="https://momofmiddleton.com/logo.jpg" width="140" alt="MOM of Middleton - Exterior cleaning &amp; Sealing" style="display:block;border:0;width:140px;max-width:140px;height:auto;"></a></td>
<td align="right" style="vertical-align:middle;padding-left:10px;"><span style="display:inline-block;background:#9A0000;border:2px solid #FFC800;border-radius:6px;padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-style:italic;font-size:18px;line-height:1.2;color:#FFFFFF;">Dirty House? Call MOM!</span></td>
</tr></table>
</td></tr>
${inner}
<tr><td style="padding:16px 24px;border-top:1px solid ${C.line};font-size:12px;color:${C.soft};">
  <div>${PHONE} · momofmiddleton@gmail.com · The Villages, FL</div>
  <div style="font-size:11px;color:#8A8590;padding-top:4px;">${footer}</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

const deposit = (q) => Math.round(q.total * 50) / 100;
const signedLine = (d) => d.book ? `Signed electronically by ${d.signature} on ${d.signedAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' })} ET (terms ${d.termsVersion}, IP ${d.signedIp}).` : '';

function customerEmail(d, q, no) {
  const first = d.name.split(' ')[0];
  const rows = q.lines.map((l) => `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid ${C.line};"><b>${esc(l.label)}</b><br><span style="font-size:13px;line-height:1.45;color:${C.soft};">${LINE_TEXT[l.key]}</span></td><td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid ${C.line};white-space:nowrap;">${money(l.price)}</td></tr>`).join('');
  const plans = PLANS.map((p) => `<tr><td style="padding:10px 0;border-top:1px solid ${C.line};">
    <div style="font-weight:700;font-size:15px;">${p.name}</div>
    <div style="font-size:12px;color:${C.soft};">${p.freq}</div></td>
    <td align="right" valign="middle" style="padding:10px 0;border-top:1px solid ${C.line};font-weight:900;font-size:18px;color:${C.spray};white-space:nowrap;">${money(p.rate[d.homeType])}/mo</td></tr>`).join('');

  const html = shell(`
<tr><td style="padding:28px 24px 8px;">
  <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.spray};font-weight:700;">${d.book ? 'Your Exterior Cleaning booking' : 'Your Exterior Cleaning estimate'}</div>
  <h1 style="margin:6px 0 12px;font-size:24px;line-height:1.25;">Thank you, ${esc(first)}!</h1>
  <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Here is the price for your ${HOME_NAMES[d.homeType].toLowerCase()} at ${esc(d.address)}, ${esc(d.city)}. Marco will call or text you at ${esc(d.phone)} to set a date.</p>
</td></tr>
<tr><td style="padding:8px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
    ${rows}
    <tr><td style="padding:12px 0 4px;font-weight:700;font-size:17px;">Total</td><td align="right" style="padding:12px 0 4px;font-weight:900;font-size:20px;color:${C.crimson};">${money(q.total)}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:12px 24px 4px;">
  <p style="margin:0;font-size:15px;line-height:1.5;">${d.book ? `<b>You asked us to do this cleaning. Marco will call or text you at ${esc(d.phone)} to set your date.</b> A 50% deposit (<b>${money(deposit(q))}</b>) is due to book; we'll send you a secure payment link. The rest is due when the job is complete.` : `<b>To book, just reply to this email or call or text ${PHONE}.</b> A 50% deposit is due when you book and the rest when the job is complete.`}</p>
</td></tr>
<tr><td style="padding:12px 24px 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed ${C.spray};border-radius:10px;"><tr><td style="padding:16px;">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.spray};font-weight:700;">Keep it clean all year</div>
    <p style="margin:6px 0 10px;font-size:14px;line-height:1.5;">After your first full cleaning (${money(FULL[d.homeType])} for your home), you can join the <b>MOM Home Investment Protection Plan</b>. Every visit includes the house wash and the Complete Exterior Package.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${plans}</table>
    ${d.lanai ? `<p style="margin:10px 0 0;font-size:13px;color:${C.soft};">Good news: on a protection plan, there's no extra charge for your lanai.</p>` : ''}
    <p style="margin:8px 0 0;font-size:13px;color:${C.soft};">Marco will go over the plans with you after your first cleaning.</p>
  </td></tr></table>
</td></tr>
<tr><td style="padding:16px 24px 24px;">
  <p style="margin:0 0 10px;font-size:14px;line-height:1.5;">Questions? Reply to this email, or call or text Marco at <a href="tel:+13528082082" style="color:${C.spray};font-weight:700;">${PHONE}</a>.</p>
  <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${C.soft};">Prices are for standard homes in Middleton and Eastport. Marco confirms your price and date before any work starts. Paver sealing and interior gutter flushing are quoted separately: <a href="tel:+13528082082" style="color:${C.spray};">call</a> or <a href="sms:+13528082082" style="color:${C.spray};">text</a> ${PHONE} for a quote.</p>
  <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${C.soft};"><b>Before your visit:</b> ${esc(BEFORE_VISIT)} Watch for our instruction email (check spam).</p>
  ${d.book ? `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${C.soft};"><b>Service terms you agreed to:</b></p>${TERMS.map((t) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${C.soft};">${esc(t)}</p>`).join('')}<p style="margin:0;font-size:12px;line-height:1.5;color:${C.soft};"><i>${esc(signedLine(d))}</i></p>` : `<p style="margin:0;font-size:12px;line-height:1.5;color:${C.soft};"><b>Waiver of liability:</b> ${WAIVER}</p>`}
</td></tr>`, `${no} · ${longDate()}`);

  const text = [
    `Thank you, ${first}!`, '',
    `Your MOM of Middleton Exterior Cleaning estimate (${no}) for your ${HOME_NAMES[d.homeType].toLowerCase()} at ${d.address}, ${d.city}:`, '',
    ...q.lines.map((l) => `  ${l.label}: ${money(l.price)}\n    ${LINE_TEXT[l.key]}`),
    `  Total: ${money(q.total)}`, '',
    d.book ? `You asked us to do this cleaning. Marco will call or text you at ${d.phone} to set your date. A 50% deposit (${money(deposit(q))}) is due to book; we'll send you a secure payment link. The rest is due when the job is complete.` : `To book, just reply to this email or call or text ${PHONE}. A 50% deposit is due when you book and the rest when the job is complete.`, '',
    `Keep it clean all year: after your first full cleaning (${money(FULL[d.homeType])} for your home), you can join the MOM Home Investment Protection Plan. Every visit includes the house wash and the Complete Exterior Package.`,
    ...PLANS.map((p) => `  ${p.name}: ${money(p.rate[d.homeType])}/mo (${p.freq})`),
    d.lanai ? 'On a protection plan, there is no extra charge for your lanai.' : '',
    '', `Marco will call or text you at ${d.phone} to set a date. Questions? Reply to this email or call/text ${PHONE}.`,
    'Prices are for standard homes in Middleton and Eastport. Marco confirms your price and date before any work starts.', '',
    `Before your visit: ${BEFORE_VISIT}`, '', ...(d.book ? ['Service terms you agreed to:', ...TERMS, signedLine(d)] : [`Waiver of liability: ${WAIVER}`]),
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  return { subject: d.book ? `Your MOM of Middleton cleaning is booked: ${money(q.total)} (we'll call to set the date)` : `Your MOM of Middleton Exterior Cleaning estimate: ${money(q.total)}`, html, text };
}

function officeEmail(d, q, no, customerSent) {
  const service = d.service === 'full' ? 'House wash + Complete Exterior Package' : 'House wash only';
  const fields = [
    ['Name', d.name], ['Mobile', d.phone], ['Email', d.email], ...(d.badEmails?.length ? [['Unusable email typed', d.badEmails.join(', ')]] : []),
    ['Address', `${d.address}, ${d.city}, FL ${d.zip}`],
    ['Home type', HOME_NAMES[d.homeType]], ['Lanai past roofline', d.lanai ? 'Yes' : 'No'],
    ['Service', service], ...q.lines.map((l) => [`  ${l.label}`, money(l.price)]),
    ['Total quoted', money(q.total)], ['Customer wants', d.book ? 'BOOK THE JOB – pending schedule' : 'Estimate only (follow up)'], ...(d.book ? [['50% deposit due', `${money(deposit(q))} – send the customer a payment link`]] : []), ...(d.book ? [['Service terms', signedLine(d)]] : []), ['How they heard about us', d.heardFrom || '—'], ['Notes', d.note || '—'],
  ];
  const html = shell(`
<tr><td style="padding:24px;">
  <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.spray};font-weight:700;">${d.book ? 'BOOKED – pending schedule' : 'Estimate only'} · New website Exterior Cleaning estimate request</div>
  <h1 style="margin:6px 0 12px;font-size:22px;">${esc(d.name)} · ${money(q.total)}</h1>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
    ${fields.map(([k, v]) => `<tr><td valign="top" style="padding:6px 12px 6px 0;color:${C.soft};white-space:nowrap;border-bottom:1px solid ${C.line};">${esc(k.trim())}</td><td style="padding:6px 0;border-bottom:1px solid ${C.line};">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}
  </table>
  <p style="margin:14px 0 0;font-size:13px;color:${C.soft};">${customerSent ? `The customer was emailed their estimate at ${esc(d.email)}.` : `<b style="color:${C.crimson};">The estimate email to the customer did not go through.</b> Please call or text them.`} Reply to this email to answer the customer directly. When they book, copy these details into ServiceMonster.</p>
</td></tr>`, `${no} · ${longDate()}`);
  const text = [`New website Exterior Cleaning estimate request (${no})`, '', ...fields.map(([k, v]) => `${k}: ${v}`), '',
    customerSent ? `The customer was emailed their estimate at ${d.email}.` : 'The estimate email to the customer did NOT go through. Please call or text them.'].join('\n');
  return { subject: `New Exterior Cleaning estimate request (${d.book ? 'BOOK – pending schedule' : 'estimate only'}): ${d.name}, ${HOME_NAMES[d.homeType]}, ${money(q.total)}`, html, text };
}

function prepEmail(d) {
  const first = d.name.split(' ')[0];
  const html = shell(`
<tr><td style="padding:28px 24px 8px;">
  <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.spray};font-weight:700;">Getting ready for your cleaning</div>
  <h1 style="margin:6px 0 12px;font-size:24px;line-height:1.25;">Hi ${esc(first)}, here's how to get ready</h1>
  <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Thank you for booking MOM of Middleton for ${esc(d.address)}, ${esc(d.city)}. Marco will call or text you at ${esc(d.phone)} to set your date. Sometimes that's as soon as the next day, so we're sending these instructions now.</p>
</td></tr>
<tr><td style="padding:4px 24px 8px;">
  <ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.5;">${PREP.map((t) => `<li style="margin:0 0 8px;">${esc(t)}</li>`).join('')}</ol>
</td></tr>
<tr><td style="padding:4px 24px 20px;">
  ${PREP_NOTE.map((t) => `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${C.soft};">${esc(t)}</p>`).join('')}
  <p style="margin:8px 0 0;font-size:15px;line-height:1.5;">Questions before your appointment? Call or text ${PHONE} or reply to this email. We look forward to making your home shine!</p>
</td></tr>`, 'MOM of Middleton · Exterior Cleaning');
  const text = [`Hi ${first}, here's how to get ready for your MOM of Middleton cleaning`, '',
    `Thank you for booking MOM of Middleton for ${d.address}, ${d.city}. Marco will call or text you at ${d.phone} to set your date. Sometimes that's as soon as the next day, so we're sending these instructions now.`, '',
    ...PREP.map((t, i) => `${i + 1}. ${t}`), '', ...PREP_NOTE, '',
    `Questions before your appointment? Call or text ${PHONE} or reply to this email. We look forward to making your home shine!`].join('\n');
  return { subject: 'How to get ready for your MOM of Middleton cleaning', html, text };
}

async function sendEmail({ to, bcc, replyTo, subject, html, text }) {
  const key = process.env.RESEND_API_KEY || process.env.Resend_API_Key || Object.entries(process.env).find(([k]) => k.toUpperCase().replace(/[^A-Z]/g, '') === 'RESENDAPIKEY')?.[1];
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'MOM of Middleton <estimates@momofmiddleton.com>',
      to: Array.isArray(to) ? to : [to], ...(bcc?.length ? { bcc } : {}), reply_to: replyTo, subject, html, text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ---------- Handler ----------

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let p;
  try { p = await req.json(); } catch { return json(400, { error: 'Bad request' }); }

  const d = {
    name: clean(p.name, 100), phone: clean(p.phone, 30), email: clean(p.email, 120), email2: clean(p.email2, 120),
    address: clean(p.address, 150), city: clean(p.city || 'The Villages', 60) || 'The Villages', zip: clean(p.zip, 10),
    homeType: p.homeType, lanai: !!p.lanai, service: p.service === 'full' ? 'full' : 'wash', fenceSides: Math.max(0, Math.min(3, parseInt(p.fenceSides, 10) || 0)), note: cleanNote(p.note),
    heardFrom: clean(p.heardFrom, 100),
    book: p.wantsJob === 'book',
    signature: clean(p.signature, 100),
  };
  if (d.book) {
    if (p.termsAgreed !== true || d.signature.length < 3) return json(400, { error: 'Please agree to the service terms and type your name to sign.', missing: ['terms'] });
    d.signedAt = new Date();
    d.signedIp = req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    d.termsVersion = TERMS_VERSION;
  }
  const missing = ['name', 'phone', 'email', 'address', 'zip'].filter((k) => !d[k]);
  if (missing.length || !PRICES[d.homeType]) {
    return json(400, { error: 'Missing or invalid fields', missing });
  }
  // Up to two customer emails. A bad address never stops the office notice.
  const isEmail = (v) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v);
  const given = [d.email, d.email2].flatMap((v) => String(v || '').split(/[,;\s]+/)).filter(Boolean);
  d.emails = [...new Set(given.filter(isEmail).map((v) => v.toLowerCase()))].slice(0, 2);
  d.badEmails = given.filter((v) => !isEmail(v));
  d.email = d.emails.join(', ') || d.email;

  // Price on the server so the page can't change it.
  const lines = [{ key: d.homeType, label: `House wash, ${HOME_NAMES[d.homeType]}`, price: PRICES[d.homeType] }];
  if (d.service === 'full') {
    lines.push({ key: 'pkg', label: 'Complete Exterior Package', price: PKG });
    if (d.lanai) lines.push({ key: 'lanai', label: 'Lanai past the roofline', price: LANAI });
  }
  if (d.fenceSides) lines.push({ key: 'fence', label: `Fence cleaning, ${d.fenceSides} side${d.fenceSides > 1 ? 's' : ''}`, price: FENCE_SIDE * d.fenceSides });
  const q = { lines, total: lines.reduce((t, l) => t + l.price, 0) };
  const no = estimateNo();

  if (process.env.DRY_RUN === '1') return json(200, { ok: true, dryRun: true, estimateNo: no, total: q.total, lines });

  const office = process.env.OFFICE_EMAIL || process.env.OWNER_EMAIL || 'momofmiddleton@gmail.com';

  let customerSent = false;
  try {
    if (!d.emails.length) throw new Error('No valid customer email: ' + d.badEmails.join(', '));
    await sendEmail({ to: d.emails, replyTo: office, ...customerEmail(d, q, no) });
    customerSent = true;
  } catch (e) { console.error('Customer email failed:', e.message); }

  // Booked on the website: send the "how to get ready" instructions right away (jobs are often done the next day).
  if (d.book && d.emails.length) {
    try { await sendEmail({ to: d.emails, replyTo: office, ...prepEmail(d) }); }
    catch (e) { console.error('Instructions email failed:', e.message); }
  }

  let officeSent = false;
  try {
    const copyTo = String(process.env.COPY_EMAIL || '').split(/[,;\s]+/).filter(Boolean);
    await sendEmail({ to: office, bcc: copyTo, replyTo: d.emails.length ? d.emails : undefined, ...officeEmail(d, q, no, customerSent) });
    officeSent = true;
  } catch (e) { console.error('Office email failed:', e.message); }

  if (process.env.SM_ENABLED === '1') {
    try { await createServiceMonsterEstimate(d, lines, q.total); } catch (e) { console.error('ServiceMonster error:', e.message); }
  }

  if (!customerSent && !officeSent) return json(502, { ok: false, error: 'Could not send estimate' });
  return json(200, { ok: true, total: q.total, estimateNo: no, emailed: customerSent, emails: d.emails, booked: d.book });
};
