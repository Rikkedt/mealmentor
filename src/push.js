/* Web push: gemmer brugerens abonnement + dagsplan i KV og sender beskeder til tiden via en cron hvert 5. minut.
   VAPID-nøglen laves automatisk første gang og gemmes i KV (aldrig i koden). */
import { supa } from './config.js';

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

async function vapid(env) {
  let v = await env.LIMITS.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    v = { jwk, pub };
    await env.LIMITS.put('vapid', JSON.stringify(v));
  }
  return v;
}

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

async function encrypt(sub, payload) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

async function jwt(v, aud) {
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:info@mealmentorai.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

export async function sendPush(env, sub, msg) {
  const v = await vapid(env);
  const aud = new URL(sub.endpoint).origin;
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { authorization: `vapid t=${await jwt(v, aud)}, k=${v.pub}`, 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '3600', urgency: 'normal' },
    body: await encrypt(sub, JSON.stringify(msg))
  });
  return r.status;
}

async function who(request, env) {
  const S = supa(env);
  const u = await fetch(`${S.url}/auth/v1/user`, { headers: { apikey: S.anon, authorization: request.headers.get('authorization') || '' } });
  return u.ok ? (await u.json()).id : null;
}

const clean = p => (Array.isArray(p) ? p : []).slice(0, 20).map(x => ({ h: +x.h, key: String(x.key || '').slice(0, 20), title: String(x.title || '').slice(0, 120), body: String(x.body || '').slice(0, 300) })).filter(x => x.h >= 0 && x.h < 24 && x.title);

export async function handlePush(request, env, path) {
  if (!env.LIMITS) return new Response('no kv', { status: 500 });
  if (path === 'key') return Response.json({ key: (await vapid(env)).pub });
  const uid = await who(request, env);
  if (!uid) return new Response('unauthorized', { status: 401 });
  const k = `push:${uid}`;
  const rec = (await env.LIMITS.get(k, 'json')) || { subs: [], plan: [] };
  const b = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  if (path === 'sync') {
    if (b.sub && b.sub.endpoint && b.sub.keys) { rec.subs = rec.subs.filter(s => s.endpoint !== b.sub.endpoint); rec.subs.push({ endpoint: b.sub.endpoint, keys: { p256dh: b.sub.keys.p256dh, auth: b.sub.keys.auth } }); rec.subs = rec.subs.slice(-5); }
    if (b.plan) { rec.plan = clean(b.plan); rec.date = String(b.date || ''); rec.tz = String(b.tz || 'Europe/Copenhagen'); }
    if (!rec.subs.length) return Response.json({ ok: false });
    await env.LIMITS.put(k, JSON.stringify(rec));
    return Response.json({ ok: true });
  }
  if (path === 'off') {
    rec.subs = b.endpoint ? rec.subs.filter(s => s.endpoint !== b.endpoint) : [];
    if (rec.subs.length) await env.LIMITS.put(k, JSON.stringify(rec)); else await env.LIMITS.delete(k);
    return Response.json({ ok: true });
  }
  if (path === 'test') {
    const res = await Promise.all(rec.subs.map(s => sendPush(env, s, { title: 'Meal Mentor AI', body: 'Det virker! Her kommer dine påmindelser.', key: 'test' }).catch(() => 0)));
    return Response.json({ sent: res });
  }
  return new Response('not found', { status: 404 });
}

const RECUR = /^(sleep|meal\d|pause|checkin|work)$/;
export async function runPushCron(env) {
  if (!env.LIMITS) return;
  let cursor;
  do {
    const l = await env.LIMITS.list({ prefix: 'push:', cursor });
    cursor = l.list_complete ? null : l.cursor;
    for (const { name } of l.keys) {
      const rec = await env.LIMITS.get(name, 'json');
      if (!rec || !rec.subs || !rec.subs.length || !rec.plan) continue;
      const tz = rec.tz || 'Europe/Copenhagen';
      const now = new Date();
      const day = now.toLocaleDateString('sv-SE', { timeZone: tz });
      const [hh, mm] = now.toLocaleTimeString('sv-SE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
      const h = hh + mm / 60;
      const stale = rec.date !== day;
      if (stale && (Date.parse(day) - Date.parse(rec.date || '2000-01-01')) > 7 * 864e5) continue;
      const due = rec.plan.filter(p => p.h <= h + 1e-6 && p.h > h - 5 / 60 && (!stale || RECUR.test(p.key)));
      let dead = false;
      for (const p of due) for (const s of rec.subs) {
        const st = await sendPush(env, s, { title: p.title, body: p.body, key: p.key }).catch(() => 0);
        if (st === 404 || st === 410) { s.dead = true; dead = true; }
      }
      if (dead) { rec.subs = rec.subs.filter(s => !s.dead); if (rec.subs.length) await env.LIMITS.put(name, JSON.stringify(rec)); else await env.LIMITS.delete(name); }
    }
  } while (cursor);
}
