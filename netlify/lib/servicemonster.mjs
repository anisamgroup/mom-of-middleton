// ServiceMonster: create the account + estimate for a website request.
// Only used when the Netlify env var SM_ENABLED=1 (needs ServiceMonster API access, which
// requires a plan upgrade). Credentials: SM_USERNAME, SM_PASSWORD.
// Optional: SM_ORDER_TYPE (default "Estimate"), SM_ITEM_PV / SM_ITEM_1S / SM_ITEM_2S / SM_ITEM_PKG / SM_ITEM_LANAI.

const API = 'https://api.servicemonster.net/v1';
const HOME_NAMES = { pv: 'Patio villa', s1: '1-story home', s2: '2-story home' };

const itemNames = () => ({
  pv: process.env.SM_ITEM_PV || '* Patio Villa Housewash',
  s1: process.env.SM_ITEM_1S || '1 Story Housewash',
  s2: process.env.SM_ITEM_2S || '2 Story Housewash',
  pkg: process.env.SM_ITEM_PKG || '*Complete Exterior Package',
  lanai: process.env.SM_ITEM_LANAI || '*Extended Lanai/Patio',
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

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  return { first: parts.join(' '), last };
}

export async function createServiceMonsterEstimate(d, lines, total) {
  const names = itemNames();
  const { first, last } = splitName(d.name);
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
}
