/**
 * Hue Stay Submit Worker
 *  POST /submit              → Google Sheets append (tab routed by type)
 *  GET  /inquiries           → 공개 문의 목록 (비공개 마스킹)
 *  GET  /admin/inquiries     → 전체 문의 목록 (ADMIN_SECRET 필요)
 *  POST /admin/reply         → 문의 답변 저장 (ADMIN_SECRET 필요)
 *
 * Secrets: GOOGLE_SA_JSON, SHEET_ID, ALLOWED_ORIGIN, ADMIN_SECRET,
 *          TELEGRAM_BOT_TOKEN (선택), TELEGRAM_CHAT_ID (선택)
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
    headers: ['접수일시','이름','연락처','이메일','회사명','제목','내용','공개여부','답변'],
    pick: (b) => [b.name||'', b.contact||'', b.email||'', b.company||'',
                  b.subject||'', b.message||'', b.isPrivate ? '비공개' : '공개', ''],
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

    /* ── GET /inquiries : 공개 게시판용 ── */
    if (url.pathname === '/inquiries' && request.method === 'GET') {
      try {
        const token = await getAccessToken(env);
        const rows = await getRows(env, token, '문의');
        const posts = rows.slice(1).map((r, i) => {
          const priv = (r[7] || '공개') === '비공개';
          if (priv) return { id: i + 1, date: r[0] || '', isPrivate: true };
          return {
            id: i + 1, date: r[0] || '', name: r[1] || '', contact: r[2] || '',
            email: r[3] || '', company: r[4] || '', subject: r[5] || '',
            message: r[6] || '', isPrivate: false, reply: r[8] || '',
          };
        });
        return json({ ok: true, posts }, 200, cors);
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500, cors);
      }
    }

    /* ── GET /admin/inquiries : 어드민 전용 ── */
    if (url.pathname === '/admin/inquiries' && request.method === 'GET') {
      const secret = url.searchParams.get('secret');
      if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
        return json({ ok: false, error: 'unauthorized' }, 401, cors);
      }
      try {
        const token = await getAccessToken(env);
        const rows = await getRows(env, token, '문의');
        const posts = rows.slice(1).map((r, i) => ({
          id: i + 1, date: r[0] || '', name: r[1] || '', contact: r[2] || '',
          email: r[3] || '', company: r[4] || '', subject: r[5] || '',
          message: r[6] || '', isPrivate: (r[7] || '공개') === '비공개',
          reply: r[8] || '',
        }));
        return json({ ok: true, posts }, 200, cors);
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500, cors);
      }
    }

    /* ── POST /admin/reply : 답변 저장 ── */
    if (url.pathname === '/admin/reply' && request.method === 'POST') {
      const secret = url.searchParams.get('secret');
      if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) {
        return json({ ok: false, error: 'unauthorized' }, 401, cors);
      }
      let body;
      try { body = await request.json(); }
      catch { return json({ ok: false, error: 'invalid json' }, 400, cors); }

      try {
        const token = await getAccessToken(env);
        // id는 1-based 데이터 행 번호. 시트 행 번호 = id + 1 (1행이 헤더)
        // 답변은 I열 (9번째 컬럼)
        const sheetRow = body.id + 1;
        const tab = encodeURIComponent('문의');
        const wurl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${tab}!I${sheetRow}?valueInputOption=USER_ENTERED`;
        const r = await fetch(wurl, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[body.reply || '']] }),
        });
        if (!r.ok) throw new Error(`sheets update ${r.status}: ${await r.text()}`);
        return json({ ok: true }, 200, cors);
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500, cors);
      }
    }

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

      if (body.type === 'inquiry' && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        await notifyTelegram(env, body).catch(() => {});
      }

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('T', ' ').replace(/\..+/, '');
}

const COL_LETTER = (n) => {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

async function getRows(env, token, tabName) {
  const tab = encodeURIComponent(tabName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${tab}`;
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`sheets read ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.values || [];
}

async function appendRow(env, token, tabName, row, colCount) {
  const tab = encodeURIComponent(tabName);
  const range = `${tab}!A:${COL_LETTER(colCount)}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}:append?valueInputOption=RAW`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] })
  });
  if (!r.ok) throw new Error(`sheets append ${r.status}: ${await r.text()}`);
}

async function ensureTabAndHeader(env, token, tabName, headers) {
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}?fields=sheets.properties`;
  const m = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!m.ok) throw new Error(`sheets meta ${m.status}: ${await m.text()}`);
  const meta = await m.json();
  const tabs = (meta.sheets || []).map(s => s.properties.title);

  if (!tabs.includes(tabName)) {
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}:batchUpdate`;
    const b = await fetch(batchUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
    if (!b.ok) throw new Error(`sheets addSheet ${b.status}: ${await b.text()}`);
  }

  // 전체 헤더 행 비교하여 필요시 업데이트
  const tab = encodeURIComponent(tabName);
  const lastCol = COL_LETTER(headers.length);
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${tab}!A1:${lastCol}1`;
  const r = await fetch(readUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!r.ok) throw new Error(`sheets read ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const existing = (data.values && data.values[0]) || [];
  if (headers.every((h, i) => existing[i] === h)) return;

  const wurl = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${tab}!A1:${lastCol}1?valueInputOption=USER_ENTERED`;
  const w = await fetch(wurl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [headers] })
  });
  if (!w.ok) throw new Error(`sheets header ${w.status}: ${await w.text()}`);
}

async function notifyTelegram(env, body) {
  const priv = body.isPrivate ? '🔒 비공개' : '🌐 공개';
  const text = [
    `🆕 [Hue Stay] 문의 신규 접수`,
    `이름: ${body.name || '-'}`,
    `연락처: ${body.contact || '-'}`,
    `이메일: ${body.email || '-'}`,
    `회사명: ${body.company || '-'}`,
    `제목: ${body.subject || '-'}`,
    `내용: ${body.message || '-'}`,
    `공개여부: ${priv}`,
  ].join('\n');
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}

/* ───── Google OAuth2 ───── */

async function getAccessToken(env) {
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await rs256Sign(unsigned, sa.private_key);
  const jwt = `${unsigned}.${signature}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) throw new Error(`oauth ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

function b64url(s) {
  const bytes = typeof s === 'string' ? new TextEncoder().encode(s) : s;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function rs256Sign(input, pemPrivateKey) {
  const key = await importPkcs8(pemPrivateKey);
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  return b64url(new Uint8Array(sig));
}

async function importPkcs8(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
