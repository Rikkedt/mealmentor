/* Sikker proxy til Claude. API-nøglen ligger kun her (Cloudflare-miljøvariabel), aldrig i appen.
   Kræver at brugeren er logget ind (Supabase-token) og har et dagligt loft pr. bruger, hvis KV "LIMITS" er koblet på. */
import { supa } from './config.js';

export async function handleAI(request, env, ctx) {
  const S = supa(env);
  const auth = request.headers.get('authorization') || '';
  if (!auth) return new Response('unauthorized', { status: 401 });
  // Login-tjekket kører samtidig med at AI'en går i gang, så brugeren ikke venter på begge efter hinanden.
  const userP = fetch(`${S.url}/auth/v1/user`, { headers: { apikey: S.anon, authorization: auth } }).then(r => r.ok ? r.json() : null).catch(() => null);

  const raw = await request.text();
  if (raw.length > 8_000_000) return new Response('too large', { status: 413 });
  const b = JSON.parse(raw);
  const photo = Array.isArray(b.images) && b.images.length > 0;

  const model = b.tier === 'default' ? (env.MODEL_PHOTO || 'claude-sonnet-5-5') : (env.MODEL_TEXT || 'claude-haiku-5-5');
  let messages;
  if (Array.isArray(b.messages)) {
    messages = b.messages.filter(m => m && m.content && (m.role === 'user' || m.role === 'assistant')).map(m => ({ role: m.role, content: String(m.content) }));
    while (messages.length && messages[0].role !== 'user') messages.shift();
  } else {
    const content = (b.images || []).map(i => ({ type: 'image', source: { type: 'base64', media_type: i.type || 'image/jpeg', data: i.data } }));
    content.push({ type: 'text', text: String(b.prompt || '') });
    messages = [{ role: 'user', content }];
  }
  if (!messages.length) return new Response('empty', { status: 400 });

  const ac = new AbortController();
  const callAI = (extra) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: ac.signal,
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ ...extra,
      model, stream: true, messages: messages.slice(-12),
      // Chat: korte svar = hurtigere. Scanning/JSON må fylde mere.
      max_tokens: b.json ? 1500 : (Array.isArray(b.messages) ? 450 : 1200),
      ...(typeof b.system === 'string' && b.system ? { system: [{ type: 'text', text: b.system.slice(0, 60000), cache_control: { type: 'ephemeral' } }] } : {})
    })
  });
  // Ingen "tænke"-fase i chatten: den gør svaret langsomt og kan bruge alle tokens, så der ingen tekst kommer.
  const aiP = callAI({ thinking: { type: 'disabled' } }).then(async r => {
    if (r.status === 400) { const t = await r.clone().text(); if (/thinking/i.test(t)) return callAI({}); }
    return r;
  });
  aiP.catch(() => {});
  const user = await userP;
  if (!user || !user.id) { ac.abort(); return new Response('unauthorized', { status: 401 }); }

  // Dagligt loft pr. bruger (nulstilles ved midnat dansk tid). Optællingen gemmes i baggrunden.
  if (env.LIMITS) {
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' });
    const kAll = `${user.id}:${day}`, kPhoto = `${user.id}:${day}:foto`;
    const [nAll, nPhoto] = await Promise.all([env.LIMITS.get(kAll), photo ? env.LIMITS.get(kPhoto) : null]).then(a => a.map(x => +x || 0));
    if (nAll >= (+env.DAILY_LIMIT || 40)) { ac.abort(); return new Response('limit', { status: 429 }); }
    if (photo && nPhoto >= (+env.PHOTO_LIMIT || 15)) { ac.abort(); return new Response('photo_limit', { status: 429 }); }
    const ttl = { expirationTtl: 172800 };
    const w = Promise.all([env.LIMITS.put(kAll, String(nAll + 1), ttl), photo ? env.LIMITS.put(kPhoto, String(nPhoto + 1), ttl) : null]).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(w);
  }

  let r;
  try { r = await aiP; } catch (e) { return new Response('ai error', { status: 502 }); }
  if (r.status === 429) return new Response('rate', { status: 429 });
  if (!r.ok) { const et = await r.text(); { const line = JSON.stringify({ ai: true, model, status: r.status, err: et.slice(0, 500), at: new Date().toISOString() }); console.log(line); } return new Response(et, { status: 502 }); }
  // Fejlsøgning: log hvad AI'en sender tilbage (typer af hændelser, tid til første tekst, evt. fejl).
  const t0 = Date.now(); let first = 0, head = '', types = {};
  const dec = new TextDecoder();
  const ts = new TransformStream({
    transform(chunk, ctl) {
      const txt = dec.decode(chunk, { stream: true });
      if (head.length < 600) head += txt;
      for (const m of txt.matchAll(/"type":"([a-z_]+)"/g)) types[m[1]] = (types[m[1]] || 0) + 1;
      if (!first && /text_delta/.test(txt)) first = Date.now() - t0;
      ctl.enqueue(chunk);
    },
    flush() { const line = JSON.stringify({ ai: true, model, sys: (b.system || '').length, msgs: messages.length, firstTextMs: first, totalMs: Date.now() - t0, types, head: first ? undefined : head.slice(0, 600), at: new Date().toISOString() }); console.log(line); }
  });
  return new Response(r.body.pipeThrough(ts), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}
