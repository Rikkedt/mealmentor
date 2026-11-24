// Meal Mentor – Cloudflare Worker: serverer appen fra /public og håndterer /api/*.
import { handleAI } from './ai.js';
import { handleConfig } from './config.js';
import { handlePush, runPushCron } from './push.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
    if (url.pathname === '/api/config' && request.method === 'GET') return handleConfig(env);
    if (url.pathname === '/api/ai-status' && request.method === 'GET') return new Response((env.LIMITS && await env.LIMITS.get('debug:ai')) || '{}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    if (url.pathname === '/api/ai' && request.method === 'POST') return handleAI(request, env, ctx);
    if (url.pathname.startsWith('/api/push/')) return handlePush(request, env, url.pathname.slice(10));
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(runPushCron(env)); }
};
