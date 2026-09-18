const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
const text = (s,status=200,headers={}) => new Response(s,{status,headers});

function b64u(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function hex(buf){return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
async function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return b64u(b);}

async function authUser(request, env){
  const h=request.headers.get('authorization')||''; const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token) return null;
  const row=await env.DB.prepare('SELECT user_id FROM sessions WHERE token=? AND expires_at>?').bind(token, new Date().toISOString()).first();
  return row?.user_id || null;
}

async function ensureSchema(env){
  // The real schema is in migrations/0001_init.sql. This guard makes first request friendlier if the user has not run it yet.
  try { await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first(); }
  catch(e){ return false; }
  return true;
}

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'Content-Type, Authorization'}});
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if(!env.DB) return json({error:'Database is not connected yet. Bind a Cloudflare D1 database as DB and run migrations/0001_init.sql.'},503);
    if(!(await ensureSchema(env))) return json({error:'Database tables are not initialized. Run migrations/0001_init.sql on the D1 database.'},503);
    const path=url.pathname;
    try {
      if(path==='/api/health') return json({status:'ok',platform:'Cloudflare Workers + D1'});
      if(path==='/api/auth/register' && request.method==='POST'){
        const {username,email,password}=await request.json();
        if(!username||!email||!password||password.length<6) return json({error:'Username, email and a password of at least 6 characters are required.'},400);
        const hash=await sha256(password);
        const existing=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email.trim().toLowerCase()).first();
        if(existing) return json({error:'User already exists'},400);
        const r=await env.DB.prepare('INSERT INTO users(username,email,password_hash) VALUES(?,?,?)').bind(username.trim(),email.trim().toLowerCase(),hash).run();
        const id=r.meta.last_row_id; const token=await randomToken();
        await env.DB.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').bind(token,id,new Date(Date.now()+30*864e5).toISOString()).run();
        return json({success:true,token,userId:id,username:username.trim()});
      }
      if(path==='/api/auth/login' && request.method==='POST'){
        const {email,password}=await request.json(); const hash=await sha256(password||'');
        const u=await env.DB.prepare('SELECT id,username FROM users WHERE email=? AND password_hash=?').bind((email||'').trim().toLowerCase(),hash).first();
        if(!u) return json({error:'Invalid credentials'},401);
        const token=await randomToken(); await env.DB.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').bind(token,u.id,new Date(Date.now()+30*864e5).toISOString()).run();
        return json({success:true,token,userId:u.id,username:u.username});
      }
      const uid=await authUser(request,env); if(!uid) return json({error:'Unauthorized'},401);

      if(path==='/api/messages' && request.method==='GET'){
        return json((await env.DB.prepare('SELECT * FROM messages WHERE user_id=? ORDER BY timestamp DESC').bind(uid).all()).results);
      }
      if(path==='/api/messages' && request.method==='POST'){
        const m=await request.json(); const content=String(m.content||'').trim(); if(!content) return json({error:'Message content is required'},400);
        const r=await env.DB.prepare(`INSERT INTO messages(app_name,sender,sender_avatar,content,category,importance,urgency,reply_required,is_sensitive,suggested_reply,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(m.appName||'Unknown',m.sender||'Unknown',m.senderAvatar||'💬',content,m.category||'GENERAL',m.importance||'MEDIUM',m.urgency||'NORMAL',m.replyRequired?1:0,m.isSensitive?1:0,m.suggestedReply||'',uid).run();
        return json({success:true,id:r.meta.last_row_id});
      }
      const mm=path.match(/^\/api\/messages\/(\d+)\/read$/); if(mm && request.method==='PUT'){
        await env.DB.prepare('UPDATE messages SET is_read=1 WHERE id=? AND user_id=?').bind(mm[1],uid).run(); return json({success:true});
      }
      if(path==='/api/messages/search' && request.method==='GET'){
        const q=`%${url.searchParams.get('q')||''}%`;
        return json((await env.DB.prepare('SELECT * FROM messages WHERE user_id=? AND (content LIKE ? OR sender LIKE ? OR app_name LIKE ?) ORDER BY timestamp DESC').bind(uid,q,q,q).all()).results);
      }
      if(path==='/api/apps' && request.method==='GET') return json((await env.DB.prepare('SELECT * FROM connected_apps WHERE user_id=? ORDER BY id DESC').bind(uid).all()).results);
      if(path==='/api/apps' && request.method==='POST'){
        const {appName}=await request.json(); if(!appName) return json({error:'appName required'},400);
        const r=await env.DB.prepare('INSERT INTO connected_apps(user_id,app_name) VALUES(?,?)').bind(uid,appName).run(); return json({success:true,id:r.meta.last_row_id});
      }
      if(path==='/api/otps' && request.method==='GET') return json((await env.DB.prepare("SELECT app_name as appName, masked, created_at as createdAt, otp_value as otpValue FROM otps WHERE user_id=? AND expires_at>datetime('now') ORDER BY created_at DESC").bind(uid).all()).results);
      if(path==='/api/otps' && request.method==='POST'){
        const {appName,otpValue}=await request.json(); const exp=new Date(Date.now()+10*60000).toISOString(); await env.DB.prepare('INSERT INTO otps(user_id,app_name,otp_value,masked,expires_at) VALUES(?,?,?,?,?)').bind(uid,appName||'Unknown',otpValue||'', '••••••',exp).run(); return json({success:true});
      }
      if(path==='/api/rules' && request.method==='GET') return json((await env.DB.prepare('SELECT * FROM rules WHERE user_id=? ORDER BY created_at DESC').bind(uid).all()).results);
      if(path==='/api/rules' && request.method==='POST'){
        const {name,whenCondition,thenAction}=await request.json(); const r=await env.DB.prepare('INSERT INTO rules(user_id,name,when_condition,then_action) VALUES(?,?,?,?)').bind(uid,name||'Rule',JSON.stringify(whenCondition||{}),JSON.stringify(thenAction||{})).run(); return json({success:true,id:r.meta.last_row_id});
      }
      if(path==='/api/activity' && request.method==='GET') return json((await env.DB.prepare('SELECT * FROM activity_logs WHERE user_id=? ORDER BY timestamp DESC LIMIT 50').bind(uid).all()).results);
      if(path==='/api/analyze' && request.method==='POST'){
        const {messageContent}=await request.json(); const t=String(messageContent||'');
        const urgent=/urgent|asap|immediately|otp|verification|deadline|due today|payment|pay now/i.test(t);
        const important=/meeting|interview|exam|assignment|invoice|salary|job|work|appointment|document|account/i.test(t);
        return json({category:urgent?'SECURITY':important?'WORK':'GENERAL',importance:urgent?'CRITICAL':important?'HIGH':'MEDIUM',urgency:urgent?'URGENT':'NORMAL',summary:t.slice(0,120)+(t.length>120?'...':''),suggestedReply:'Thanks for the message!',confidenceScore:0.8});
      }
      return json({error:'Not found'},404);
    } catch(e){ return json({error:e?.message||'Server error'},500); }
  }
};
