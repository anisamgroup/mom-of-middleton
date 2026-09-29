// Website price form: emails the customer their estimate (Resend) and, when API
// credentials are set, also creates the account + estimate in ServiceMonster.
// Credentials live only in Netlify environment variables (never in the page):
//   SM_USERNAME, SM_PASSWORD  – ServiceMonster API user (Settings > API Users, "Super User")
// Optional overrides:
//   SM_ORDER_TYPE             – order type for estimates (default "Estimate")
//   SM_ITEM_PV, SM_ITEM_1S, SM_ITEM_2S, SM_ITEM_PKG, SM_ITEM_LANAI – exact ServiceMonster service names
//   SM_DRY_RUN=1              – validate and price only, don't write to ServiceMonster

const API = 'https://api.servicemonster.net/v1';

const PRICES = { pv: 248, s1: 298, s2: 398 };
const PKG = 50, LANAI = 50;
const HOME_NAMES = { pv: 'Patio villa', s1: '1-story home', s2: '2-story home' };

const itemNames = () => ({
  pv: process.env.SM_ITEM_PV || '* Patio Villa Housewash',
  s1: process.env.SM_ITEM_1S || '1 Story Housewash',
  s2: process.env.SM_ITEM_2S || '2 Story Housewash',
  pkg: process.env.SM_ITEM_PKG || '*Complete Exterior Package',
  lanai: process.env.SM_ITEM_LANAI || '*Extended Lanai/Patio',
});

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function auth() {
  const u = process.env.SM_USERNAME, p = process.env.SM_PASSWORD;
  if (!u || !p) throw new Error('ServiceMonster credentials are not set');
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

async function sm(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

const idOf = (obj, key) => obj?.[key] || obj?.id || obj?.ID || obj?.[key.toLowerCase()] ||
  (Array.isArray(obj?.items) && obj.items[0]?.[key]) || null;
const rows = (d) => Array.isArray(d) ? d : (d?.items || d?.data || d?.results || []);

// Names are matched loosely: case, spaces, a leading "*" and the "Additons"/"Additions" typo don't matter.
const norm = (v) => String(v || '').toLowerCase().replace(/^[\s*]+/, '').replace(/additons/g, 'additions').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
let itemCache = null;
async function findItem(name) {
  if (!itemCache) {
    itemCache = [];
    for (let page = 0; page < 10; page++) {
      const batch = rows(await sm('GET', `/items?limit=100&pageIndex=${page}`));
      itemCache.push(...batch);
      if (batch.length < 100) break;
    }
  }
  const want = norm(name);
  const item = itemCache.find((i) => [i.itemName, i.name].some((v) => norm(v) === want));
  if (!item) throw new Error(`Service "${name}" not found in ServiceMonster`);
  return { id: item.itemID || item.id, name };
}

// ---- Estimate emails (Resend). Works with or without the ServiceMonster API. ----
//   RESEND_API_KEY – from resend.com (free plan)
//   FROM_EMAIL     – e.g. "MOM of Middleton <estimates@momofmiddleton.com>" (domain verified in Resend)
//   OWNER_EMAIL    – where new-request notices go (default momofmiddleton@gmail.com)
const PLAN_RATES = { pv: [62.5, 79, 109], s1: [79, 99, 139], s2: [99, 125, 175] };
const LINE_TEXT = {
  pv: ['Patio Villa House Wash', 'Removal of all dirt, mold and mildew from exterior walls, windows and sills, plus cobwebs and bugs (except wasp nests). We soft wash: low-pressure water with professional cleaning agents that kill mold and help your paint last longer.'],
  s1: ['1-Story House Wash', null], s2: ['2-Story House Wash', null],
  pkg: ['Complete Exterior Package', 'Driveway, walkway, entry, back patio, exterior gutters, oxidation streaks (tiger stripes) and screen lanai. Removes dirt, mold, mildew and most bugs.'],
  lanai: ['Extended Lanai/Patio', 'Lanai/patio area extending past the roofline.'],
};
LINE_TEXT.s1[1] = LINE_TEXT.s2[1] = LINE_TEXT.pv[1];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = (n) => '$' + (n % 1 ? n.toFixed(2) : n);

function estimateHtml(d, lines, total, no) {
  const td = 'padding:10px 6px;border-bottom:1px solid #E1DDE3;vertical-align:top;font-size:14px';
  const rowsHtml = lines.map((l) => `<tr><td style="${td}"><b>${LINE_TEXT[l.key][0]}</b><br><span style="color:#57525E;font-size:13px">${LINE_TEXT[l.key][1]}</span></td><td style="${td};text-align:right;white-space:nowrap">${usd(l.price)}</td></tr>`).join('');
  const p = PLAN_RATES[d.homeType];
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#17141C;max-width:620px;margin:0 auto">
<div style="border-top:6px solid #6A0B9E;padding:18px 0 8px"><h2 style="margin:0">Your MOM of Middleton Estimate</h2>
<div style="color:#57525E;font-size:13px">Estimate No. ${no} &middot; ${date}</div></div>
<p>Hi ${esc(d.name.split(' ')[0])}, thanks for reaching out! Here is your estimate for <b>${esc(d.address)}, ${esc(d.city)}</b> (${HOME_NAMES[d.homeType].toLowerCase()}).</p>
<table style="width:100%;border-collapse:collapse">${rowsHtml}
<tr><td style="padding:14px 6px;font-weight:bold;font-size:17px">Total</td><td style="padding:14px 6px;text-align:right;font-weight:bold;font-size:17px">${usd(total)}</td></tr></table>
<p><b>To book, just reply to this email or call/text 352-808-2082.</b> Payment is due when the job is complete. Marco confirms your price and date before any work starts.</p>
<h3 style="margin:24px 0 6px">After your first cleaning: Home Investment Protection Plan</h3>
<p style="font-size:14px;margin:0 0 6px">Each visit includes the house wash and the Complete Exterior Package:</p>
<table style="border-collapse:collapse;font-size:14px">
<tr><td style="padding:3px 18px 3px 0">3 cleanings a year</td><td style="text-align:right"><b>${usd(p[0])}/mo</b></td></tr>
<tr><td style="padding:3px 18px 3px 0">4 cleanings a year</td><td style="text-align:right"><b>${usd(p[1])}/mo</b></td></tr>
<tr><td style="padding:3px 18px 3px 0">6 cleanings a year</td><td style="text-align:right"><b>${usd(p[2])}/mo</b></td></tr></table>
${d.lanai ? '<p style="font-size:13px;color:#57525E">Lanai past the roofline adds $50 per visit.</p>' : ''}
<div style="margin-top:22px;font-size:12px;color:#57525E;line-height:1.5">
<p><b>Before your visit:</b> Water plants and grass near the areas we're cleaning at least 1 hour before we arrive and for 3 days after; some browning may occur. Move cars, furniture, rugs, potted plants and hanging baskets away from the service areas. Watch for our instruction email (check spam).</p>
<p><b>Waiver of liability:</b> By approving this estimate, verbally or otherwise, you release and hold harmless MOM of Middleton and its employees and agents from claims arising from the services, including property or plant damage, discoloration or fading of surfaces, damage to light fixtures, outlets or key sockets, personal injury, and events beyond our control. You accept the risks of exterior cleaning, are responsible for insuring your own property, and are responsible for any permits or law-enforcement personnel the job requires.</p>
<p>MOM of Middleton &middot; 2113 Everglades Lane #1067, The Villages, FL 32163 &middot; 352-808-2082 &middot; momofmiddleton@gmail.com</p></div></div>`;
}

function leadHtml(d, total, no, customerHtml) {
  const r = (k, v) => `<tr><td style="padding:3px 12px 3px 0;color:#57525E">${k}</td><td><b>${esc(v)}</b></td></tr>`;
  return `<div style="font-family:Helvetica,Arial,sans-serif"><h2 style="margin:0 0 10px">New website estimate: ${usd(total)}</h2>
<table style="font-size:15px">${r('Name', d.name)}${r('Phone', d.phone)}${r('Email', d.email)}${r('Address', `${d.address}, ${d.city}, FL ${d.zip}`)}
${r('Home', HOME_NAMES[d.homeType])}${r('Service', d.service === 'full' ? 'House wash + Complete Exterior Package' : 'House wash only')}
${r('Lanai past roofline', d.lanai ? 'Yes' : 'No')}${r('Notes', d.note || '-')}${r('Estimate No.', no)}</table>
<p style="color:#57525E">The customer already got the estimate below. Reply to this email to reach them. When they book, copy these details into ServiceMonster.</p><hr>${customerHtml}</div>`;
}

async function sendEmail(to, subject, html, replyTo) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.FROM_EMAIL, to: [to], subject, html, reply_to: replyTo }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function emailEstimate(d, lines, total) {
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) return false;
  const owner = process.env.OWNER_EMAIL || 'momofmiddleton@gmail.com';
  const no = 'W' + Date.now().toString().slice(-6);
  const html = estimateHtml(d, lines, total, no);
  await sendEmail(d.email, `Your MOM of Middleton estimate: ${usd(total)}`, html, owner);
  try { await sendEmail(owner, `New estimate: ${d.name}, ${HOME_NAMES[d.homeType]}, ${usd(total)}`, leadHtml(d, total, no, html), d.email); }
  catch (e) { console.error('Owner email failed:', e.message); }
  return true;
}

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  return { first: parts.join(' '), last };
}

function clean(s, max = 200) { return String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max); }

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let p;
  try { p = await req.json(); } catch { return json(400, { error: 'Bad request' }); }

  const d = {
    name: clean(p.name, 100), phone: clean(p.phone, 30), email: clean(p.email, 120),
    address: clean(p.address, 150), city: clean(p.city || 'The Villages', 60), zip: clean(p.zip, 10),
    homeType: p.homeType, lanai: !!p.lanai, service: p.service === 'full' ? 'full' : 'wash', note: clean(p.note, 1000),
  };
  const missing = ['name', 'phone', 'email', 'address', 'zip'].filter((k) => !d[k]);
  if (missing.length || !PRICES[d.homeType] || !/^\S+@\S+\.\S+$/.test(d.email)) {
    return json(400, { error: 'Missing or invalid fields', missing });
  }

  // Price on the server so the page can't change it.
  const names = itemNames();
  const lines = [{ key: d.homeType, price: PRICES[d.homeType] }];
  if (d.service === 'full') {
    lines.push({ key: 'pkg', price: PKG });
    if (d.lanai) lines.push({ key: 'lanai', price: LANAI });
  }
  const total = lines.reduce((t, l) => t + l.price, 0);

  // 1) Email the estimate to the customer (and a lead notice to MOM).
  let emailed = false;
  try { emailed = await emailEstimate(d, lines, total); } catch (e) { console.error('Estimate email failed:', e.message); }

  // 2) ServiceMonster: only when API credentials are set (needs the Grow plan or higher).
  const smOn = process.env.SM_USERNAME && process.env.SM_PASSWORD;
  if (!smOn || process.env.SM_DRY_RUN === '1') {
    return emailed ? json(200, { ok: true, emailed, total }) : json(502, { ok: false, error: 'Could not send estimate' });
  }

  try {
    const { first, last } = splitName(d.name);
    // Reuse an existing account with the same email if there is one.
    let accountID = null;
    try {
      const found = rows(await sm('GET', `/accounts?wField=email&wValue=${encodeURIComponent(d.email)}&limit=1`));
      accountID = found[0]?.accountID || null;
    } catch { /* ignore lookup errors */ }

    if (!accountID) {
      const acct = await sm('POST', '/accounts', {
        accountName: last ? `${last}, ${first}` : first,
        firstName: first, lastName: last,
        address1: d.address, city: d.city, state: 'FL', zip: d.zip,
        email: d.email, phone1: d.phone, phone1Label: 'Mobile', canText1: true,
        note: `Website estimate request. Home: ${HOME_NAMES[d.homeType]}. Lanai past roofline: ${d.lanai ? 'yes' : 'no'}.`,
      });
      accountID = idOf(acct, 'accountID');
    }
    if (!accountID) throw new Error('No accountID returned');

    let siteID = null;
    try { siteID = rows(await sm('GET', `/accounts/${accountID}/sites`))[0]?.siteID || null; } catch { /* optional */ }

    const orderBody = {
      accountID, orderType: process.env.SM_ORDER_TYPE || 'Estimate',
      note: `Website request — ${HOME_NAMES[d.homeType]}, ${d.service === 'full' ? 'house wash + Complete Exterior Package' : 'house wash only'}` +
        `${d.lanai ? ', lanai past roofline' : ''}. Quoted total $${total}.${d.note ? ' Customer note: ' + d.note : ''}`,
    };
    if (siteID) orderBody.siteID = siteID;
    const order = await sm('POST', '/orders', orderBody);
    const orderID = idOf(order, 'orderID');
    if (!orderID) throw new Error('No orderID returned');

    for (const [i, l] of lines.entries()) {
      const item = await findItem(names[l.key]);
      await sm('POST', '/lineitems', { orderID, itemID: item.id, price: l.price, quantity: 1, rowIndex: i });
    }
    return json(200, { ok: true, emailed, total });
  } catch (e) {
    console.error('ServiceMonster error:', e.message);
    return emailed ? json(200, { ok: true, emailed, total }) : json(502, { ok: false, error: 'Could not create estimate' });
  }
};

