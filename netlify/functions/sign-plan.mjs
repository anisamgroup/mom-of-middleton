// momofmiddleton.com/plan -> signed MOM Home Investment Protection Plan agreement.
//
// The customer picks home type + plan level, fills in their details, agrees to sign
// electronically and draws a signature. This function:
//   1. fills the blank agreement PDF (/plan/MOM-Protection-Plan-Agreement.pdf) with their
//      details, plan, signature and an e-signature record (date/time, IP, email),
//   2. emails the signed PDF to the customer and to the office (Resend, same key as estimates).
// MOM's lines are filled in automatically (accepted electronically), so no countersigning is needed.
// Billing is handled outside the website (first check, then ACH in ServiceMonster).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const HOME = { pv: 'Patio Villa', s1: '1-Story', s2: '2-Story' };
const FULL = { pv: 298, s1: 348, s2: 448 };
const PLAN = {
  std: { name: 'Standard Protection', freq: '3 visits a year, every 4 months', field: 'plan_standard', rate: { pv: 62.5, s1: 79, s2: 99 } },
  enh: { name: 'Enhanced Protection', freq: '4 visits a year, every 3 months', field: 'plan_enhanced', rate: { pv: 79, s1: 99, s2: 125 } },
  pre: { name: 'Premium Protection', freq: '6 visits a year, every 2 months', field: 'plan_premium', rate: { pv: 109, s1: 139, s2: 175 } },
};
const PHONE = '352-808-2082';
const money = (v) => '$' + (v % 1 ? v.toFixed(2) : v);
const clean = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function nowParts() {
  const d = new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return {
    short: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' }).format(d),
    long: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(d),
    stamp: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'long' }).format(d),
    id: `MOM-PLAN-${p.year}${p.month}${p.day}-${Math.floor(1000 + Math.random() * 9000)}`,
    iso: d.toISOString(),
  };
}

// WinAnsi-safe text for the standard PDF fonts.
const ansi = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

async function buildPdf(blank, d, sigPng, t, sig2Png) {
  const pdf = await PDFDocument.load(blank);
  const form = pdf.getForm();
  const set = (name, val) => { const f = form.getTextField(name); f.setText(ansi(val)); f.enableReadOnly(); };
  set('customer_name', d.name);
  set('property_address', d.address);
  set('city_zip', `${d.city} ${d.zip}`);
  set('phone', d.phone);
  set('email', d.email);
  set('home_type', HOME[d.home]);
  for (const k of Object.keys(PLAN)) {
    const cb = form.getCheckBox(PLAN[k].field);
    if (k === d.plan) cb.check(); else cb.uncheck();
    cb.enableReadOnly();
  }
  set('customer_print_name', d.signedName);
  set('customer_date', t.short);
  // MOM accepts automatically: the agreement is complete the moment the customer signs.
  set('mom_representative', 'Accepted electronically by MOM of Middleton');
  set('mom_print_name', process.env.MOM_REP_NAME || 'Marco Vianello, General Manager');
  set('mom_date', t.short);

  // Signature image over the customer signature line.
  const sigField = form.getTextField('customer_signature');
  const w = sigField.acroField.getWidgets()[0];
  const r = w.getRectangle();
  const page = pdf.getPages()[2];
  const img = await pdf.embedPng(sigPng);
  const maxH = 40, maxW = 260;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  form.removeField(sigField); // the field's shaded box would cover the drawn signature
  page.drawImage(img, { x: r.x + 6, y: r.y - 4, width: img.width * scale, height: img.height * scale });

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const ink = rgb(0.1, 0.1, 0.1), lineCol = rgb(0.55, 0.55, 0.6);

  // Second customer signature (spouse / co-owner), drawn in the open space under the MOM lines.
  if (sig2Png) {
    const top = 462, L = 64;
    page.drawText('Second Customer (spouse / co-owner)', { x: L, y: top, size: 10.5, font: bold, color: ink });
    page.drawText('Customer Signature:', { x: L, y: top - 44, size: 11, font: times, color: ink });
    page.drawLine({ start: { x: 160, y: top - 46 }, end: { x: 560, y: top - 46 }, thickness: 0.6, color: lineCol });
    const img2 = await pdf.embedPng(sig2Png);
    const sc2 = Math.min(260 / img2.width, 34 / img2.height);
    page.drawImage(img2, { x: 166, y: top - 44, width: img2.width * sc2, height: img2.height * sc2 });
    page.drawText('Print Name:', { x: L, y: top - 72, size: 11, font: times, color: ink });
    page.drawText(ansi(d.name2), { x: 122, y: top - 71, size: 11, font, color: ink });
    page.drawLine({ start: { x: 118, y: top - 74 }, end: { x: 308, y: top - 74 }, thickness: 0.6, color: lineCol });
    page.drawText('Date:', { x: 325, y: top - 72, size: 11, font: times, color: ink });
    page.drawText(t.short, { x: 362, y: top - 71, size: 11, font, color: ink });
    page.drawLine({ start: { x: 360, y: top - 74 }, end: { x: 445, y: top - 74 }, thickness: 0.6, color: lineCol });
  }

  // E-signature record at the bottom of the signature page.
  const lines = [
    `Agreement ID: ${t.id}`,
    `Signed electronically by ${d.signedName} (${d.email}) on ${t.stamp}.`,
    ...(sig2Png ? [`Also signed electronically by ${d.name2}${d.email2 ? ` (${d.email2})` : ''} on the same device at the same time.`] : []),
    `Signed at momofmiddleton.com/plan from IP address ${d.ip || 'unknown'}.`,
    `Plan selected: ${PLAN[d.plan].name} (${PLAN[d.plan].freq}), ${HOME[d.home]}.`,
    `Monthly rate ${money(PLAN[d.plan].rate[d.home])}, starting after the initial full-service cleaning (${money(FULL[d.home])}).`,
    `Customer${sig2Png ? 's' : ''} agreed to sign electronically and to receive this agreement by email.`,
  ];
  let y = 150;
  page.drawRectangle({ x: 48, y: y - lines.length * 13 - 10, width: 516, height: lines.length * 13 + 28, borderColor: rgb(0.42, 0.04, 0.62), borderWidth: 1 });
  page.drawText('ELECTRONIC SIGNATURE RECORD', { x: 58, y, size: 9, font: bold, color: rgb(0.42, 0.04, 0.62) });
  for (const l of lines) { y -= 13; page.drawText(ansi(l), { x: 58, y, size: 8.5, font, color: ink, maxWidth: 496 }); }

  pdf.setTitle(`MOM Home Investment Protection Plan - ${ansi(d.name)}`);
  pdf.setSubject(t.id);
  return pdf.save();
}


// The blank agreement ships with the function (netlify.toml included_files); fall back to the public copy.
const AGREEMENT = 'plan/MOM-Protection-Plan-Agreement.pdf';
async function loadBlank(req) {
  for (const base of [process.cwd(), process.env.LAMBDA_TASK_ROOT || '', '/var/task']) {
    if (!base) continue;
    try { return await readFile(path.join(base, AGREEMENT)); } catch { /* try next */ }
  }
  try { const r = await fetch(new URL('/' + AGREEMENT, req.url)); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { /* none */ }
  return null;
}

async function sendEmail({ to, replyTo, subject, html, text, attachments }) {
  const key = process.env.RESEND_API_KEY || process.env.Resend_API_Key || Object.entries(process.env).find(([k]) => k.toUpperCase().replace(/[^A-Z]/g, '') === 'RESENDAPIKEY')?.[1];
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'MOM of Middleton <estimates@momofmiddleton.com>',
      to: Array.isArray(to) ? to : [to], reply_to: replyTo, subject, html, text, attachments,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function shell(inner) {
  return `<!doctype html><html><body style="margin:0;background:#F7F6F3;font-family:'Segoe UI',Verdana,Arial,sans-serif;color:#17141C;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#0B0B0C;padding:14px 18px;border-bottom:4px solid #FFC800;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:150px;"><a href="https://momofmiddleton.com/" style="text-decoration:none;"><img src="https://momofmiddleton.com/logo.jpg" width="140" alt="MOM of Middleton - Exterior cleaning &amp; Sealing" style="display:block;border:0;width:140px;max-width:140px;height:auto;"></a></td>
<td align="right" style="vertical-align:middle;padding-left:10px;"><span style="display:inline-block;background:#9A0000;border:2px solid #FFC800;border-radius:6px;padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-style:italic;font-size:18px;line-height:1.2;color:#FFFFFF;">Dirty House? Call MOM!</span></td>
</tr></table>
</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55;">${inner}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #E1DDE3;font-size:12px;color:#57525E;"><a href="tel:+13528082082" style="color:#57525E;">${PHONE}</a> · momofmiddleton@gmail.com · The Villages, FL</td></tr>
</table></td></tr></table></body></html>`;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let p;
  try { p = await req.json(); } catch { return json(400, { error: 'Bad request' }); }

  const d = {
    name: clean(p.name, 100), phone: clean(p.phone, 30), email: clean(p.email, 120).toLowerCase(),
    address: clean(p.address, 150), city: clean(p.city || 'The Villages', 60) || 'The Villages', zip: clean(p.zip, 10),
    home: p.home, plan: p.plan, signedName: clean(p.signedName, 100),
    ip: clean(req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '', 60).split(',')[0],
  };
  const missing = ['name', 'phone', 'email', 'address', 'zip', 'signedName'].filter((k) => !d[k]);
  if (!HOME[d.home]) missing.push('home');
  if (!PLAN[d.plan]) missing.push('plan');
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(d.email)) missing.push('email');
  if (!p.agreeTerms || !p.agreeEsign) missing.push('agreement');
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(p.signature || ''));
  if (!m || m[1].length < 400 || m[1].length > 900000) missing.push('signature');
  // Optional second signer (spouse / co-owner), signing on the same device.
  let sig2 = null;
  if (p.signature2) {
    d.name2 = clean(p.name2, 100);
    d.email2 = clean(p.email2, 120).toLowerCase();
    const m2 = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(p.signature2));
    if (!d.name2) missing.push('name2');
    if (d.email2 && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(d.email2)) missing.push('email2');
    if (!m2 || m2[1].length < 400 || m2[1].length > 900000) missing.push('signature2'); else sig2 = Buffer.from(m2[1], 'base64');
  }
  if (missing.length) return json(400, { error: 'Missing or invalid fields', missing });

  const t = nowParts();
  const blank = await loadBlank(req);
  if (!blank) return json(500, { error: 'Agreement file not found' });
  let bytes;
  try { bytes = await buildPdf(blank, d, Buffer.from(m[1], 'base64'), t, sig2); }
  catch (e) { console.error('PDF error:', e); return json(500, { error: 'Could not create the agreement' }); }

  if (process.env.DRY_RUN === '1') return json(200, { ok: true, dryRun: true, id: t.id, bytes: bytes.length });

  const pl = PLAN[d.plan], rate = money(pl.rate[d.home]), full = money(FULL[d.home]);
  const first = d.name.split(' ')[0];
  const filename = `MOM-Protection-Plan-${d.name.replace(/[^A-Za-z0-9]+/g, '-')}-${t.id}.pdf`;
  const attachments = [{ filename, content: Buffer.from(bytes).toString('base64') }];
  const office = process.env.OFFICE_EMAIL || process.env.OWNER_EMAIL || 'momofmiddleton@gmail.com';

  let customerSent = false, officeSent = false;
  try {
    await sendEmail({
      to: [...new Set([d.email, d.email2].filter(Boolean))], replyTo: office, attachments,
      subject: 'Your signed MOM Home Investment Protection Plan',
      html: shell(`<p style="margin:0 0 12px;font-size:20px;font-weight:800;">Welcome to the Protection Plan, ${esc(first)}${d.name2 ? ` and ${esc(d.name2.split(' ')[0])}` : ''}!</p>
<p>Thank you for signing up. Your signed agreement is attached for your records.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#FFF6CC;border-radius:8px;margin:12px 0;"><tr><td style="padding:14px 16px;">
<b>${esc(pl.name)}</b> · ${esc(pl.freq)}<br>${esc(HOME[d.home])} · <b>${rate} per month</b><br>
<span style="font-size:13px;color:#57525E;">Starts after your first full-service cleaning (${full}).</span></td></tr></table>
<p><b>What happens next:</b> Marco will call or text you to schedule your first cleaning and set up your monthly payment.</p>
<p style="font-size:13px;color:#57525E;">Agreement ID ${t.id}. Questions? <a href="tel:+13528082082" style="color:#6A0B9E;font-weight:700;">Call</a> or <a href="sms:+13528082082" style="color:#6A0B9E;font-weight:700;">text</a> ${PHONE}.</p>`),
      text: `Welcome to the MOM Home Investment Protection Plan, ${first}!\n\nYour signed agreement is attached.\n${pl.name} (${pl.freq}), ${HOME[d.home]}, ${rate} per month after your first full-service cleaning (${full}).\n\nMarco will call or text you to schedule your first cleaning and set up your monthly payment.\n\nAgreement ID ${t.id}. Questions? Call or text ${PHONE}.`,
    });
    customerSent = true;
  } catch (e) { console.error('Customer email failed:', e.message); }

  try {
    const rows = [['Customer', d.name], ...(d.name2 ? [['Second signer', d.name2 + (d.email2 ? ` (${d.email2})` : '')]] : []), ['Phone', d.phone], ['Email', d.email], ['Address', `${d.address}, ${d.city} ${d.zip}`],
      ['Home type', HOME[d.home]], ['Plan', `${pl.name} (${pl.freq})`], ['Monthly rate', rate], ['First full-service cleaning', full],
      ['Signed', t.stamp], ['Agreement ID', t.id]];
    await sendEmail({
      to: office, replyTo: d.email, attachments,
      subject: `New Protection Plan signed: ${d.name}, ${pl.name}, ${rate}/mo`,
      html: shell(`<p style="margin:0 0 12px;font-size:20px;font-weight:800;">New Protection Plan signed</p>
<table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">${rows.map(([k, v]) => `<tr><td style="color:#57525E;border-bottom:1px solid #E1DDE3;">${k}</td><td style="border-bottom:1px solid #E1DDE3;"><b>${esc(v)}</b></td></tr>`).join('')}</table>
<p style="margin-top:16px;"><b>Next steps:</b> create the contract in ServiceMonster, schedule the first full cleaning, collect the first check and set up ACH. Nothing to sign: the attached agreement is complete.</p>
${customerSent ? '' : '<p style="color:#9A0000;"><b>The copy to the customer did NOT go through.</b> Please send them the attached PDF.</p>'}`),
      text: [`New Protection Plan signed`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', 'Next steps: create the contract in ServiceMonster, schedule the first full cleaning, collect the first check and set up ACH. Nothing to sign: the attached agreement is complete.', customerSent ? '' : 'The copy to the customer did NOT go through. Please send them the attached PDF.'].join('\n'),
    });
    officeSent = true;
  } catch (e) { console.error('Office email failed:', e.message); }

  if (!customerSent && !officeSent) return json(502, { ok: false, error: 'Could not send the agreement' });
  return json(200, { ok: true, id: t.id, emailed: customerSent, email: d.email, emails: [...new Set([d.email, d.email2].filter(Boolean))] });
};
