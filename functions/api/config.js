export const onRequestGet = ({ env }) =>
  Response.json({ url: env.SUPABASE_URL, anon: env.SUPABASE_ANON_KEY }, { headers: { 'cache-control': 'public, max-age=300' } });
