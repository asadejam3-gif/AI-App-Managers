const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
});

function cors(response) {
  const h = new Headers(response.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  return new Response(response.body, { status: response.status, headers: h });
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function token() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

async function auth(request, env) {
  const header = request.headers.get('Authorization') || '';
  const t = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!t || !env.DB) return null;
  const row = await env.DB.prepare('SELECT userId FROM sessions WHERE token = ? AND expiresAt > datetime("now")').bind(t).first();
  return row ? Number(row.userId) : null;
}

function cleanUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, email: user.email, avatar: user.avatar };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/api/health' && method === 'GET') return json({ status: 'ok', platform: 'Cloudflare Workers' });
  if (!env.DB) return json({ error: 'Database is not connected. Bind your D1 database as DB in Cloudflare.' }, 503);

  if (path === '/api/auth/register' && method === 'POST') {
    const { username, email, password } = await body(request);
    if (!username || !email || !password) return json({ error: 'username, email and password are required' }, 400);
    const hash = await sha256(password);
    try {
      const result = await env.DB.prepare('INSERT INTO users (username,email,password) VALUES (?,?,?)').bind(username, email.toLowerCase(), hash).run();
      const userId = result.meta.last_row_id;
      const t = token();
      await env.DB.prepare('INSERT INTO sessions (token,userId,expiresAt) VALUES (?,?,datetime("now","+30 days"))').bind(t, userId).run();
      return json({ success: true, token: t, userId });
    } catch (e) { return json({ error: 'User already exists or registration failed' }, 400); }
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const { email, password } = await body(request);
    const hash = await sha256(password || '');
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND password = ?').bind((email || '').toLowerCase(), hash).first();
    if (!user) return json({ error: 'Invalid credentials' }, 401);
    const t = token();
    await env.DB.prepare('INSERT INTO sessions (token,userId,expiresAt) VALUES (?,?,datetime("now","+30 days"))').bind(t, user.id).run();
    return json({ success: true, token: t, userId: user.id, username: user.username });
  }

  const userId = await auth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  if (path === '/api/messages' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM messages WHERE userId = ? ORDER BY timestamp DESC').bind(userId).all();
    return json(rows.results || []);
  }
  if (path === '/api/messages' && method === 'POST') {
    const b = await body(request);
    const r = await env.DB.prepare(`INSERT INTO messages (appName,sender,senderAvatar,content,category,importance,urgency,replyRequired,isSensitive,suggestedReply,userId) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(b.appName || '', b.sender || '', b.senderAvatar || '👤', b.content || '', b.category || 'GENERAL', b.importance || 'MEDIUM', b.urgency || 'LOW', b.replyRequired ? 1 : 0, b.isSensitive ? 1 : 0, b.suggestedReply || '', userId).run();
    return json({ success: true, id: r.meta.last_row_id });
  }
  const readMatch = path.match(/^\/api\/messages\/(\d+)\/read$/);
  if (readMatch && method === 'PUT') {
    await env.DB.prepare('UPDATE messages SET isRead = 1 WHERE id = ? AND userId = ?').bind(readMatch[1], userId).run();
    return json({ success: true });
  }
  if (path === '/api/messages/search' && method === 'GET') {
    const q = `%${url.searchParams.get('q') || ''}%`;
    const rows = await env.DB.prepare('SELECT * FROM messages WHERE userId = ? AND (content LIKE ? OR sender LIKE ? OR appName LIKE ?) ORDER BY timestamp DESC').bind(userId, q, q, q).all();
    return json(rows.results || []);
  }

  if (path === '/api/apps' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM connected_apps WHERE userId = ? ORDER BY id DESC').bind(userId).all();
    return json(rows.results || []);
  }
  if (path === '/api/apps' && method === 'POST') {
    const b = await body(request);
    const r = await env.DB.prepare('INSERT INTO connected_apps (userId,appName) VALUES (?,?)').bind(userId, b.appName || '').run();
    return json({ success: true, id: r.meta.last_row_id });
  }

  if (path === '/api/otps' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT appName, masked, createdAt FROM otps WHERE userId = ? AND expiresAt > datetime("now") ORDER BY createdAt DESC').bind(userId).all();
    return json(rows.results || []);
  }
  if (path === '/api/otps' && method === 'POST') {
    const b = await body(request);
    const r = await env.DB.prepare('INSERT INTO otps (userId,appName,otpValue,masked,expiresAt) VALUES (?,?,?,?,datetime("now","+10 minutes"))').bind(userId, b.appName || '', b.otpValue || '', '••••••').run();
    return json({ success: true, id: r.meta.last_row_id });
  }

  if (path === '/api/rules' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM rules WHERE userId = ? ORDER BY createdAt DESC').bind(userId).all();
    return json(rows.results || []);
  }
  if (path === '/api/rules' && method === 'POST') {
    const b = await body(request);
    const r = await env.DB.prepare('INSERT INTO rules (userId,name,whenCondition,thenAction) VALUES (?,?,?,?)').bind(userId, b.name || '', JSON.stringify(b.whenCondition || {}), JSON.stringify(b.thenAction || {})).run();
    return json({ success: true, id: r.meta.last_row_id });
  }

  if (path === '/api/activity' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM activity_logs WHERE userId = ? ORDER BY timestamp DESC LIMIT 50').bind(userId).all();
    return json(rows.results || []);
  }

  if (path === '/api/analyze' && method === 'POST') {
    const b = await body(request);
    const content = String(b.messageContent || '');
    return json({ category: 'GENERAL', importance: content.length > 100 ? 'HIGH' : 'MEDIUM', urgency: 'LOW', summary: content.slice(0, 60) + (content.length > 60 ? '...' : ''), suggestedReply: 'Thanks for the message!', confidenceScore: 0.75 });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return cors(await handleApi(request, env));
      return env.ASSETS.fetch(request);
    } catch (e) {
      return cors(json({ error: 'Server error', detail: e.message }, 500));
    }
  }
};
