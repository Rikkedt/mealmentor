// Supabase-adresse og offentlig (anon) nøgle. Begge er offentlige – adgangen styres af reglerne i databasen.
const URL = 'https://ugleivliwefxeenasmuv.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnbGVpdmxpd2VmeGVlbmFzbXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyOTM4NDMsImV4cCI6MjExMDg2OTg0M30.VJZyb40jkmYbusRjiLcu_j4n6WQWRJb7FNfY5ZX0oEM';
export const supa = env => ({ url: env.SUPABASE_URL || URL, anon: env.SUPABASE_ANON_KEY || ANON });
// RevenueCat: offentlige SDK-nøgler (de er beregnet til at ligge i appen). Sættes som variabler i Cloudflare.
const rc = env => ({ web: env.RC_WEB_PUBLIC_KEY || null, ios: env.RC_IOS_PUBLIC_KEY || null, android: env.RC_ANDROID_PUBLIC_KEY || null });
export const handleConfig = env => Response.json({ ...supa(env), rc: rc(env) }, { headers: { 'cache-control': 'public, max-age=300' } });
