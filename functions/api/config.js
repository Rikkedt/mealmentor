// Supabase-adresse og offentlig (anon) nøgle. Begge er offentlige – adgangen styres af reglerne i databasen.
const URL = 'https://ugleivliwefxeenasmuv.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnbGVpdmxpd2VmeGVlbmFzbXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyOTM4NDMsImV4cCI6MjExMDg2OTg0M30.VJZyb40jkmYbusRjiLcu_j4n6WQWRJb7FNfY5ZX0oEM';
export const supa = env => ({ url: env.SUPABASE_URL || URL, anon: env.SUPABASE_ANON_KEY || ANON });
export const onRequestGet = ({ env }) => Response.json(supa(env), { headers: { 'cache-control': 'public, max-age=300' } });
