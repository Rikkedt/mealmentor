/* Sikker proxy til Claude. API-nøglen ligger kun her (Cloudflare-miljøvariabel), aldrig i appen.
   Kræver at brugeren er logget ind (Supabase-token) og har et dagligt loft pr. bruger, hvis KV "LIMITS" er koblet på. */
import { supa } from './config.js';

export async function onRequestPost({ request, env }) {
  const S = supa(env);
  const auth = request.headers.get('authorization') || '';
  const u = await fetch(`${S.url}/auth/v1/user`, { headers: { apikey: S.anon, authorization: auth } });
  if (!u.ok) return new Response('unauthorized', { status: 401 });
  const user = await u.json();

  const raw = await request.text();
  if (raw.length > 8_000_000) return new Response('too large', { status: 413 });
  const b = JSON.parse(raw);

  if (env.LIMITS) {
    const key = `${user.id}:${new Date().toISOString().slice(0, 10)}`;
    const n = +(await env.LIMITS.get(key)) || 0;
    if (n >= (+env.DAILY_LIMIT || 150)) return new Response('limit', { status: 429 });
    await env.LIMITS.put(key, String(n + 1), { expirationTtl: 172800 });
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
    body: JSON.stringify({ model, max_tokens: b.json ? 1500 : 1200, stream: true, messages })
  });
  if (r.status === 429) return new Response('rate', { status: 429 });
  if (!r.ok) return new Response(await r.text(), { status: 502 });
  return new Response(r.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}
