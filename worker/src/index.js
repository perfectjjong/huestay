/**
 * Hue Stay Submit Worker
 *  POST /submit  →  Google Sheets append (tab routed by type)
 *
 * Required secrets:
 *   GOOGLE_SA_JSON   - Service Account JSON (전체 내용)
 *   SHEET_ID         - Google Sheet ID
 *   ALLOWED_ORIGIN   - CORS 허용 origin (예: https://huestay.pages.dev)
 *
 * 라우팅:
 *   body.type === 'inquiry'      → tab '문의'
 *   body.type === 'reservation'  → tab '예약'
 *   기타                          → tab '기타'
 */

const TABS = {
  reservation: {
    name: '예약',
    headers: ['접수일시','이름','연락처','이메일','회사명','체크인','체크아웃','인원','메시지'],
    pick: (b) => [b.name||'', b.contact||'', b.email||'', b.company||'',
                  b.checkin||'', b.checkout||'', b.guests||'', b.message||''],
  },
  inquiry: {
    name: '문의',
    headers: ['접수일시','이름','연락처','이메일','회사명','제목','내용'],
    pick: (b) => [b.name||'', b.contact||'', b.email||'', b.company||'',
                  b.subject||'', b.message||''],
  },
  other: {
    name: '기타',
    headers: ['접수일시','유형','이름','연락처','이메일','회사명','체크인','체크아웃','인원','제목','내용'],
    pick: (b) => [b.type||'', b.name||'', b.contact||'', b.email||'', b.company||'',
                  b.checkin||'', b.checkout||'', b.guests||'', b.subject||'', b.message||''],
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname !== '/submit') return json({ ok: false, error: 'not found' }, 404, cors);
    if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ ok: false, error: 'invalid json' }, 400, cors); }

    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid body' }, 400, cors);
    }

    const tab = TABS[body.type] || TABS.other;
    try {
      const token = await getAccessToken(env);
      const row = [nowIso(), ...tab.pick(body)];
      await ensureTabAndHeader(env, token, tab.name, tab.headers);
      await appendRow(env, token, tab.name, row, tab.headers.length);
      return json({ ok: true, tab: tab.name }, 200, cors);
    } catch (e) {
      return json({ ok: false, error: String(e?.message || e) }, 500, cors);
    }
  }
};

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allow = (env.ALLOWED_ORIGIN || '*').trim();
  const allowed = (allow === '*' || origin === allow) ? (allow === '*' ? '*' : origin) : allow;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

function nowIso() {
  const d = new Date();
  // KST(UTC+9) 기준 표시
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('T', ' ').replace(/\..+/, '');
}

const COL_LETTER = (n) => {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

async function appendRow(env, token, tabName, row, colCount) {
  const tab = encodeURIComponent(tabName);
  const range = `${tab}!A:${COL_LETTER(colCount)}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] })
  });
  if (!r.ok) throw new Error(`sheets append ${r.status}: ${await r.text()}`);
}

async function ensureTabAndHeader(env, token, tabName, headers) {
  // 1. spreadsheet metadata 조회 - 탭 존재 확인
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}?fields=sheets.properties`;
  const m = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!m.ok) throw new Error(`sheets meta ${m.status}: ${await m.text()}`);
  const meta = await m.json();
  const tabs = (meta.sheets || []).map(s => s.properties.title);

  // 2. 탭이 없으면 생성
  if (!tabs.includes(tabName)) {
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}:batchUpdate`;
    const b = await fetch(batchUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: tabName } } }]
      }),
    });
    if (!b.ok) throw new Error(`sheets addSheet ${b.status}: ${await b.text()}`);
  }

  // 3. 헤더 확인 및 입력
  const tab = encodeURIComponent(tabName);
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${tab}!A1`;
  const r = await fetch(readUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!r.ok) throw new Error(`sheets read ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const a1 = (data.values && data.values[0] && data.values[0][0]) || '';
  if (a1 === headers[0]) return;
  const lastCol = COL_LETTER(headers.length);
  const wurl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${tab}!A1:${lastCol}1?valueInputOption=USER_ENTERED`;
  const w = await fetch(wurl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [headers] })
  });
  if (!w.ok) throw new Error(`sheets header ${w.status}: ${await w.text()}`);
}

/* ───── Google OAuth2: Service Account JWT → access_token ───── */

async function getAccessToken(env) {
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await rs256Sign(unsigned, sa.private_key);
  const jwt = `${unsigned}.${signature}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error(`oauth ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

function b64url(s) {
  const bytes = typeof s === 'string' ? new TextEncoder().encode(s) : s;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function rs256Sign(input, pemPrivateKey) {
  const key = await importPkcs8(pemPrivateKey);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(input)
  );
  return b64url(new Uint8Array(sig));
}

async function importPkcs8(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
