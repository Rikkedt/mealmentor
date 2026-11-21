// Meal Mentor – Cloudflare Worker: serverer appen fra /public og håndterer /api/*.
import { handleAI } from './ai.js';
import { handleConfig } from './config.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
    if (url.pathname === '/api/config' && request.method === 'GET') return handleConfig(env);
    if (url.pathname === '/api/ai' && request.method === 'POST') return handleAI(request, env);
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
