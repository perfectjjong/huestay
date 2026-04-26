/**
 * Hue Stay Submit Worker
 *  POST /submit                     → Google Sheets append
 *  GET  /inquiries                  → 공개 문의 목록
 *  GET  /admin/inquiries            → 전체 문의 목록 (ADMIN_SECRET 필요)
 *  POST /admin/reply                → 문의 답변 저장 (ADMIN_SECRET 필요)
 *  GET  /spaces                     → 공간 설정 반환 (KV → 없으면 기본값)
 *  POST /admin/spaces               → 공간 텍스트 메타 저장 (KV)
 *  POST /admin/spaces/:id/image     → 공간 이미지 업로드 (R2)
 *  GET  /images/spaces/:file        → R2 이미지 서빙
 */

const DEFAULT_SPACES = [
  { id:'yard',   cat:'outdoor', tc:'t-yard',    emoji:'🌿', bKo:'야외 공간', bEn:'Outdoor',   nKo:'마당',        nEn:'Garden Yard',      dKo:'탁 트인 하늘 아래 펼쳐지는 야외 마당. 아침 커피 한 잔과 함께 여유를 즐기거나 저녁 노을을 감상하기 좋습니다.',         dEn:'A beautiful outdoor yard under the open sky. Perfect for morning coffee or watching the evening sunset.',   img:'images/spaces/yard.jpg' },
  { id:'dining', cat:'dining',  tc:'t-dining',  emoji:'🍽️', bKo:'식당',     bEn:'Dining',    nKo:'다이닝룸',    nEn:'Dining Room',      dKo:'정성스러운 한국 가정식이 제공되는 식사 공간. 매일 조식이 준비되며 한국의 맛을 사우디에서 느껴보세요.',          dEn:'Korean home-style meals served daily. Enjoy the taste of home in the heart of Saudi Arabia.',              img:'images/spaces/dining.jpg' },
  { id:'bed1',   cat:'bedroom', tc:'t-bed1',    emoji:'🛏️', bKo:'침실 1',   bEn:'Room 101',  nKo:'침실 101',    nEn:'Bedroom 101',      dKo:'따뜻한 톤의 더블베드룸. 에어컨과 개인 욕실 완비. 프라이빗한 휴식 공간.',                                         dEn:'Warm-toned double bedroom with A/C and private bathroom.',                                                 img:'images/spaces/bed1.jpg' },
  { id:'bed2',   cat:'bedroom', tc:'t-bed2',    emoji:'🛏️', bKo:'침실 2',   bEn:'Room 102',  nKo:'침실 102',    nEn:'Bedroom 102',      dKo:'트윈베드 구성. 두 분이 편안하게 사용할 수 있는 넉넉한 공간.',                                                       dEn:'Twin bed setup, spacious enough for two guests.',                                                          img:'images/spaces/bed2.jpg' },
  { id:'bed3',   cat:'bedroom', tc:'t-bed3',    emoji:'🛏️', bKo:'침실 3',   bEn:'Room 103',  nKo:'침실 103',    nEn:'Bedroom 103',      dKo:'혼자 조용히 쉬기에 최적인 싱글룸. 아늑하고 아담한 나만의 공간.',                                                    dEn:'A cozy single room perfect for solo travelers.',                                                           img:'images/spaces/bed3.jpg' },
  { id:'bed4',   cat:'bedroom', tc:'t-bed4',    emoji:'🛏️', bKo:'침실 4',   bEn:'Room 104',  nKo:'침실 104',    nEn:'Bedroom 104',      dKo:'마당이 보이는 더블룸. 자연광이 풍부하고 아침 풍경이 아름답습니다.',                                                  dEn:'Double room overlooking the yard. Abundant natural light.',                                                img:'images/spaces/bed4.jpg' },
  { id:'bed5',   cat:'bedroom', tc:'t-bed5',    emoji:'🛏️', bKo:'침실 5',   bEn:'Room 105',  nKo:'침실 105',    nEn:'Bedroom 105',      dKo:'가족 단위에 적합한 트리플룸. 여러 명이 함께 편안하게 지낼 수 있습니다.',                                            dEn:'Triple room ideal for families or small groups.',                                                          img:'images/spaces/bed5.jpg' },
  { id:'bed6',   cat:'bedroom', tc:'t-bed6',    emoji:'🛏️', bKo:'침실 6',   bEn:'Room 106',  nKo:'침실 106',    nEn:'Bedroom 106',      dKo:'프리미엄 더블룸. 독립된 구조로 최상의 프라이버시. 가장 인기 있는 객실.',                                            dEn:'Premium double room with maximum privacy. Most popular.',                                                  img:'images/spaces/bed6.jpg' },
  { id:'liv1',   cat:'living',  tc:'t-living1', emoji:'🛋️', bKo:'거실 1',   bEn:'Living 1',  nKo:'메인 거실',   nEn:'Main Living Room',  dKo:'넓고 시원한 공용 거실. 소파, TV, 도서, 보드게임을 갖추고 있어 편안하게 쉬어갈 수 있습니다.',                       dEn:'Spacious common living room with sofa, TV, books, and board games.',                                       img:'images/spaces/living1.jpg' },
  { id:'liv2',   cat:'living',  tc:'t-living2', emoji:'📺', bKo:'거실 2',   bEn:'Living 2',  nKo:'TV 거실',     nEn:'TV Lounge',         dKo:'대형 TV와 기타가 있는 아늑한 두 번째 거실. 작은 모임이나 여가 시간을 즐기기 좋습니다.',                            dEn:'Cozy lounge with a large TV and guitar, perfect for relaxing evenings.',                                   img:'images/spaces/tv_room.jpg' },
  { id:'meal1',  cat:'meal',    tc:'t-meal1',   emoji:'🍚', bKo:'식사',     bEn:'Meals',     nKo:'조식',        nEn:'Breakfast',         dKo:'매일 아침 정성껏 준비한 한국식 조식. 따뜻한 밥과 국, 반찬으로 하루를 시작하세요.',                                     dEn:'Korean-style breakfast served every morning. Start your day with warm rice, soup, and side dishes.',        img:'' },
  { id:'meal2',  cat:'meal',    tc:'t-meal2',   emoji:'🥘', bKo:'식사',     bEn:'Meals',     nKo:'한식 정식',   nEn:'Korean Set Meal',   dKo:'깊은 맛의 한식 정식. 찌개·구이·나물 등 집밥 그대로의 풍성한 한 끼를 즐기실 수 있습니다.',                             dEn:'Full Korean set meal with stew, grilled dishes, and seasoned vegetables — just like home.',                img:'' },
  { id:'meal3',  cat:'meal',    tc:'t-meal3',   emoji:'☕', bKo:'음료',     bEn:'Drinks',    nKo:'커피 & 음료', nEn:'Coffee & Drinks',   dKo:'에스프레소 머신과 다양한 티, 음료를 24시간 자유롭게 이용하실 수 있습니다.',                                             dEn:'Espresso machine, teas, and beverages available 24 hours.',                                                img:'' },
  { id:'meal4',  cat:'meal',    tc:'t-meal4',   emoji:'🥗', bKo:'건강식',   bEn:'Healthy',   nKo:'샐러드 & 간식', nEn:'Salad & Snacks', dKo:'신선한 샐러드와 과일, 한국 간식류를 상시 비치. 가벼운 식사도 걱정 없습니다.',                                         dEn:'Fresh salad, fruit, and Korean snacks available anytime.',                                                 img:'' },
];

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

const IMG_TYPES = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', avif:'image/avif' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* ── GET /spaces : 공간 설정 ── */
    if (url.pathname === '/spaces' && request.method === 'GET') {
      try {
        const stored = env.SPACES_KV ? await env.SPACES_KV.get('spaces_config', 'json') : null;
        return json({ ok: true, spaces: stored || DEFAULT_SPACES }, 200, cors);
      } catch {
        return json({ ok: true, spaces: DEFAULT_SPACES }, 200, cors);
      }
    }

    /* ── POST /admin/spaces : 공간 텍스트 메타 저장 ── */
    if (url.pathname === '/admin/spaces' && request.method === 'POST') {
      if (!isAdmin(url, env)) return json({ ok: false, error: 'unauthorized' }, 401, cors);
      if (!env.SPACES_KV) return json({ ok: false, error: 'KV not configured' }, 500, cors);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid json' }, 400, cors); }
      if (!Array.isArray(body.spaces)) return json({ ok: false, error: 'spaces array required' }, 400, cors);
      await env.SPACES_KV.put('spaces_config', JSON.stringify(body.spaces));
      return json({ ok: true }, 200, cors);
    }

    /* ── POST /admin/spaces/:id/image : 이미지 업로드 (KV 저장) ── */
    const imgUploadMatch = url.pathname.match(/^\/admin\/spaces\/([^/]+)\/image$/);
    if (imgUploadMatch && request.method === 'POST') {
      if (!isAdmin(url, env)) return json({ ok: false, error: 'unauthorized' }, 401, cors);
      if (!env.SPACES_KV) return json({ ok: false, error: 'KV not configured' }, 500, cors);
      const spaceId = imgUploadMatch[1];
      let formData;
      try { formData = await request.formData(); } catch { return json({ ok: false, error: 'invalid form data' }, 400, cors); }
      const file = formData.get('file');
      if (!file || !file.size) return json({ ok: false, error: 'no file' }, 400, cors);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const ct  = IMG_TYPES[ext] || 'image/jpeg';
      const kvKey = `img:${spaceId}`;
      const buf = await file.arrayBuffer();
      // KV 메타에 content-type 저장, 값은 바이너리
      await env.SPACES_KV.put(kvKey, buf, { metadata: { contentType: ct } });
      return json({ ok: true, url: `/images/spaces/${spaceId}` }, 200, cors);
    }

    /* ── GET /images/spaces/:id : KV 이미지 서빙 ── */
    const imgServeMatch = url.pathname.match(/^\/images\/spaces\/([^/]+)$/);
    if (imgServeMatch && request.method === 'GET') {
      if (!env.SPACES_KV) return new Response('Not configured', { status: 503 });
      const spaceId = imgServeMatch[1];
      const { value, metadata } = await env.SPACES_KV.getWithMetadata(`img:${spaceId}`, 'arrayBuffer');
      if (!value) return new Response('Not Found', { status: 404 });
      const ct = (metadata && metadata.contentType) || 'image/jpeg';
      return new Response(value, {
        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400', ...cors },
      });
    }

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
      if (!isAdmin(url, env)) return json({ ok: false, error: 'unauthorized' }, 401, cors);
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
      if (!isAdmin(url, env)) return json({ ok: false, error: 'unauthorized' }, 401, cors);
      let body;
      try { body = await request.json(); }
      catch { return json({ ok: false, error: 'invalid json' }, 400, cors); }
      try {
        const token = await getAccessToken(env);
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

function isAdmin(url, env) {
  const secret = url.searchParams.get('secret');
  return env.ADMIN_SECRET && secret === env.ADMIN_SECRET;
}

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
