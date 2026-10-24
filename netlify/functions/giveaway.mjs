// MOM's Holiday Giveaway (Nov 16 – Dec 13, 2026) -> entry emails (sent through Resend).
//
// For every valid entry this function sends:
//   1. To the office (momofmiddleton@gmail.com): the entry, numbered MOM-GIVE-YYMMDD-####.
//   2. To the person who entered: a short "you're entered" confirmation with the rules.
//
// Only homes in Middleton or the Eastport area of The Villages can win. The page and this
// function both refuse other areas and ZIP codes; the office still confirms the address
// (village name) before the winner is announced.
//
// Uses the same Netlify environment variables as estimate.mjs (RESEND_API_KEY, EMAIL_FROM, OFFICE_EMAIL).
// Entries whose request has test=true and a name starting with "TEST" are accepted before the
// giveaway opens and are marked TEST in the subject line.

const OPEN = Date.UTC(2026, 10, 16, 5, 0, 0);   // Mon Nov 16, 2026, 00:00 Florida time
const CLOSE = Date.UTC(2026, 11, 14, 5, 0, 0);  // Mon Dec 14, 2026, 00:00 Florida time (= Dec 13, 11:59 PM)
const ZIPS = ['34785', '34762', '32162', '32163']; // Middleton (Wildwood) and the Eastport-area Villages ZIPs
const AREAS = { middleton: 'Middleton (Wildwood)', eastport: 'Eastport area, The Villages' };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const clean = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function entryNo() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: '2-digit', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `MOM-GIVE-${p.year}${p.month}${p.day}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function sendEmail({ to, replyTo, subject, html, text }) {
  const key = process.env.RESEND_API_KEY || process.env.Resend_API_Key || Object.entries(process.env).find(([k]) => k.toUpperCase().replace(/[^A-Z]/g, '') === 'RESENDAPIKEY')?.[1];
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'MOM of Middleton <estimates@momofmiddleton.com>',
      to: Array.isArray(to) ? to : [to], reply_to: replyTo, subject, html, text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const wrap = (inner) => `<!doctype html><html><body style="margin:0;background:#F7F6F3;font-family:'Segoe UI',Verdana,Arial,sans-serif;color:#17141C;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#0B0B0C;padding:14px 18px;border-bottom:4px solid #FFC800;"><img src="https://momofmiddleton.com/logo.jpg" width="140" alt="MOM of Middleton" style="display:block;width:140px;height:auto;border:0;"></td></tr>
<tr><td style="padding:22px 24px;font-size:16px;line-height:1.55;">${inner}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #E1DDE3;font-size:12px;color:#57525E;">352-808-2082 · momofmiddleton@gmail.com · momofmiddleton.com<br>This giveaway is not sponsored, endorsed or run by Facebook or Instagram.</td></tr>
</table></td></tr></table></body></html>`;

export default async (req) => {
  if (req.method !== 'POST') return json(405, { message: 'POST only' });
  let p;
  try { p = await req.json(); } catch { return json(400, { message: 'Bad request.' }); }

  const d = {
    forWho: p.forWho === 'neighbor' ? 'neighbor' : 'me', area: p.area,
    nomName: clean(p.nomName, 100), why: clean(p.why, 600),
    address: clean(p.address, 150), village: clean(p.village, 80), zip: clean(p.zip, 10),
    name: clean(p.name, 100), phone: clean(p.phone, 30), email: clean(p.email, 120).toLowerCase(), agree: p.agree === true,
  };
  const isTest = p.test === true && /^test/i.test(d.name);
  const now = Date.now();
  if (!isTest && now < OPEN) return json(403, { message: 'The giveaway opens Monday, November 16.' });
  if (!isTest && now >= CLOSE) return json(403, { message: 'Sorry, entries closed on December 13.' });

  if (!AREAS[d.area]) return json(400, { message: 'Sorry, this giveaway is only for homes in Middleton or the Eastport area of The Villages.' });
  if (!ZIPS.includes(d.zip)) return json(400, { message: 'That ZIP code is outside Middleton and the Eastport area. This giveaway is only for homes there.' });
  const missing = ['address', 'village', 'name', 'phone', 'email'].filter((k) => !d[k]);
  if (d.forWho === 'neighbor' && !d.nomName) missing.push('nomName');
  if (missing.length || !d.agree) return json(400, { message: 'Please fill in every box and tick the 18+ box.', missing });
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(d.email)) return json(400, { message: 'Please check your email address.' });

  const no = entryNo();
  const office = process.env.OFFICE_EMAIL || process.env.OWNER_EMAIL || 'momofmiddleton@gmail.com';
  const forLine = d.forWho === 'neighbor' ? `Nominating a neighbor: ${d.nomName}` : 'Their own home';
  const rows = [
    ['Entry number', no], ['Entry for', forLine], ['Area', AREAS[d.area]], ['Village / neighborhood', d.village],
    ['Home address', `${d.address}, ${d.zip}`], ['Entered by', d.name], ['Phone', d.phone], ['Email', d.email],
    ...(d.why ? [['Why they deserve it', d.why]] : []), ['18+ and agreed to rules', 'Yes'],
  ];
  const officeText = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\nBefore announcing a winner: confirm the home really is in Middleton or the Eastport area (check the village name).';
  const officeHtml = wrap(`<h2 style="margin:0 0 12px;font-size:20px;">🎁 New giveaway entry${isTest ? ' (TEST)' : ''}</h2>
<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:15px;">${rows.map(([k, v]) => `<tr><td style="color:#57525E;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>
<p style="margin-top:14px;font-size:14px;color:#9A0000;">Before announcing a winner, confirm the home really is in Middleton or the Eastport area (check the village name).</p>`);

  const who = d.forWho === 'neighbor' ? `${d.nomName}'s home` : 'your home';
  const custText = `Hi ${d.name},\n\nYou're entered in MOM's Holiday Giveaway for ${who} at ${d.address} (${d.village}). Your entry number is ${no}.\n\nWe pick one winner at random on Monday, December 14 and announce it on our Facebook and Instagram pages. If you win, we'll call you to confirm the address and set up a day.\n\nRemember: only homes in Middleton or the Eastport area of The Villages can win.\n\nGood luck!\nMOM of Middleton · Dirty House? Call MOM! · 352-808-2082`;
  const custHtml = wrap(`<h2 style="margin:0 0 12px;font-size:22px;">You're entered! 🎉</h2>
<p>Hi ${esc(d.name)},</p>
<p>You're entered in <b>MOM's Holiday Giveaway</b> for ${esc(who)} at ${esc(d.address)} (${esc(d.village)}). Your entry number is <b>${no}</b>.</p>
<p>We pick one winner at random on <b>Monday, December 14</b> and announce it on our Facebook and Instagram pages. If you win, we'll call you to confirm the address and set up a day.</p>
<p style="font-size:14px;color:#57525E;">Only homes in Middleton or the Eastport area of The Villages can win.</p>
<p>Good luck!<br><b>MOM of Middleton</b> · Dirty House? Call MOM!</p>`);

  let officeSent = false, custSent = false;
  try {
    await sendEmail({ to: office, replyTo: d.email, subject: `${isTest ? 'TEST – ' : ''}🎁 Giveaway entry: ${d.name}${d.forWho === 'neighbor' ? ' for ' + d.nomName : ''} – ${d.village}`, html: officeHtml, text: officeText });
    officeSent = true;
  } catch (e) { console.error('Office email failed:', e.message); }
  try {
    await sendEmail({ to: d.email, replyTo: office, subject: "You're entered in MOM's Holiday Giveaway! 🎁", html: custHtml, text: custText });
    custSent = true;
  } catch (e) { console.error('Entrant email failed:', e.message); }

  if (!officeSent) return json(502, { message: 'Sorry, we could not save your entry.' });
  return json(200, { ok: true, entryNo: no, emailed: custSent });
};
