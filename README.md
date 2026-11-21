# Meal Mentor – mealmentor.com

Web-versionen af Meal Mentor. Den kører på Cloudflare Pages, gemmer login og data i Supabase (EU) og kalder Claude gennem en sikker server-funktion (`functions/api/ai.js`). API-nøglen ligger kun hos Cloudflare – aldrig i appen.

```
public/            selve appen (index.html bygges fra prototypen med build.py)
functions/api/     ai.js (Claude-proxy) og config.js (Supabase-adresse til appen)
supabase/          schema.sql (tabel + adgangsregler)
```

## 1. Supabase – allerede sat op
Projektet `mealmentor` (Frankfurt) er oprettet, og tabellen med adgangsregler ligger der. Adresse og offentlig nøgle står i `functions/api/config.js`.
Det eneste du skal: **Authentication → URL Configuration** (https://supabase.com/dashboard/project/ugleivliwefxeenasmuv/auth/url-configuration)
- Site URL: `https://mealmentor.com`
- Redirect URLs: `https://mealmentor.com/**`, `https://www.mealmentor.com/**` og `https://*.pages.dev/**`

Supabase' indbyggede login-mail har et lavt loft pr. time. Til flere testere: **Authentication → SMTP** med fx Resend eller Brevo.

## 2. Claude API-nøgle – ca. 5 min
1. console.anthropic.com → **API Keys** → **Create key** (navn `mealmentor`).
2. **Billing → Limits**: sæt et månedligt loft, fx 25 $, mens I tester.

## 3. GitHub + Cloudflare Pages – ca. 10 min
1. GitHub: opret et **privat** repo `mealmentor` og læg indholdet af denne mappe i det (GitHub Desktop → Add → commit → push).
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → vælg `mealmentor`.
   - Framework preset: **None**
   - Build command: *(tom)*
   - Build output directory: `public`
3. **Settings → Variables and Secrets** (Production) – tilføj én hemmelighed:
   `ANTHROPIC_API_KEY` = nøglen fra trin 2 (vælg **Encrypt**)
4. Valgfrit dagligt loft pr. bruger: opret et KV-namespace `mealmentor-limits`, bind det som `LIMITS` under **Settings → Bindings**, og sæt `DAILY_LIMIT` (standard 150 AI-kald pr. bruger pr. dag).
5. **Deployments → Retry deployment**, så variablerne kommer med.

## 4. Domænet
1. Ligger mealmentor.com ikke allerede i Cloudflare: **Add a domain** → skift navneservere hos den forhandler, hvor du købte det.
2. Pages-projektet → **Custom domains** → tilføj `mealmentor.com` og `www.mealmentor.com`.

## Opdatering af appen
Når prototypen ændres: læg den nye `madscanner.html` ved siden af mappen og kør `python3 build.py`, commit og push – Cloudflare udgiver automatisk.

## Modeller
Tekst: `claude-haiku-5-5` · Foto: `claude-sonnet-5-5`. Kan ændres med variablerne `MODEL_TEXT` og `MODEL_PHOTO`.
