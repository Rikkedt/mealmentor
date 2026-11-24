/* Sikker proxy til Claude. API-nøglen ligger kun her (Cloudflare-miljøvariabel), aldrig i appen.
   Kræver at brugeren er logget ind (Supabase-token) og har et dagligt loft pr. bruger, hvis KV "LIMITS" er koblet på. */
import { supa } from './config.js';

export async function handleAI(request, env) {
  const S = supa(env);
  const auth = request.headers.get('authorization') || '';
  const u = await fetch(`${S.url}/auth/v1/user`, { headers: { apikey: S.anon, authorization: auth } });
  if (!u.ok) return new Response('unauthorized', { status: 401 });
  const user = await u.json();

  const raw = await request.text();
  if (raw.length > 8_000_000) return new Response('too large', { status: 413 });
  const b = JSON.parse(raw);

  // Dagligt loft pr. bruger (nulstilles ved midnat dansk tid)
  if (env.LIMITS) {
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' });
    const photo = Array.isArray(b.images) && b.images.length > 0;
    const kAll = `${user.id}:${day}`, kPhoto = `${user.id}:${day}:foto`;
    const [nAll, nPhoto] = await Promise.all([env.LIMITS.get(kAll), photo ? env.LIMITS.get(kPhoto) : null]).then(a => a.map(x => +x || 0));
    if (nAll >= (+env.DAILY_LIMIT || 40)) return new Response('limit', { status: 429 });
    if (photo && nPhoto >= (+env.PHOTO_LIMIT || 15)) return new Response('photo_limit', { status: 429 });
    const ttl = { expirationTtl: 172800 };
    await Promise.all([env.LIMITS.put(kAll, String(nAll + 1), ttl), photo ? env.LIMITS.put(kPhoto, String(nPhoto + 1), ttl) : null]);
  }

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

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, stream: true, messages: messages.slice(-12),
      // Chat: korte svar = hurtigere. Scanning/JSON må fylde mere.
      max_tokens: b.json ? 1500 : (Array.isArray(b.messages) ? 450 : 1200),
      ...(typeof b.system === 'string' && b.system ? { system: [{ type: 'text', text: b.system.slice(0, 60000), cache_control: { type: 'ephemeral' } }] } : {})
    })
  });
  if (r.status === 429) return new Response('rate', { status: 429 });
  if (!r.ok) return new Response(await r.text(), { status: 502 });
  return new Response(r.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}
