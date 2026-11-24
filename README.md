# Meal Mentor – mealmentorai.com

Web-versionen af Meal Mentor. Den kører som Cloudflare Worker (ligesom foodtrux og sableandmons), gemmer login og data i Supabase (EU) og kalder Claude gennem en sikker server-funktion (`functions/api/ai.js`). API-nøglen ligger kun hos Cloudflare – aldrig i appen.

```
public/            selve appen (index.html bygges fra prototypen med build.py)
src/               worker.js (router), ai.js (Claude-proxy), config.js (Supabase-adresse)
wrangler.jsonc     Cloudflare-opsætning
supabase/          schema.sql (tabel + adgangsregler)
```

## 1. Supabase – allerede sat op
Projektet `mealmentor` (Frankfurt) er oprettet, og tabellen med adgangsregler ligger der. Adresse og offentlig nøgle står i `functions/api/config.js`.
Det eneste du skal: **Authentication → URL Configuration** (https://supabase.com/dashboard/project/ugleivliwefxeenasmuv/auth/url-configuration)
- Site URL: `https://mealmentorai.com`
- Redirect URLs: `https://mealmentorai.com/**`, `https://www.mealmentorai.com/**` og `https://*.workers.dev/**`

Supabase' indbyggede login-mail har et lavt loft pr. time. Til flere testere: **Authentication → SMTP** med fx Resend eller Brevo.

## 2. Claude API-nøgle – ca. 5 min
1. console.anthropic.com → **API Keys** → **Create key** (navn `mealmentor`).
2. **Billing → Limits**: sæt et månedligt loft, fx 25 $, mens I tester.

## 3. Cloudflare Worker – ca. 5 min
1. Cloudflare → **Workers & Pages → Create application → Import a repository** → vælg `Rikkedt/mealmentor`.
2. Lad alle felter stå som de er (navn `mealmentor`, deploy-kommando `npx wrangler deploy`) → **Deploy**.
3. Worker'en → **Settings → Variables and Secrets → Add** → type **Secret**, navn `ANTHROPIC_API_KEY`, værdi = nøglen fra trin 2 → **Deploy**.

## 4. Domænet
1. Ligger mealmentorai.com ikke allerede i Cloudflare: **Add a domain** → skift navneservere hos den forhandler, hvor du købte det.
2. Worker'en → **Settings → Domains & Routes → Add → Custom domain** → `mealmentorai.com`, og igen for `www.mealmentorai.com`.

## Opdatering af appen
Når prototypen ændres: læg den nye `madscanner.html` ved siden af mappen og kør `python3 build.py`, commit og push – Cloudflare udgiver automatisk.

Valgfrit dagligt AI-loft pr. bruger: se kommentaren i `wrangler.jsonc` og sæt variablen `DAILY_LIMIT` (standard 150).

## Modeller
Tekst: `claude-haiku-5-5` · Foto: `claude-sonnet-5-5`. Kan ændres med variablerne `MODEL_TEXT` og `MODEL_PHOTO`.

## iOS-app (TestFlight) og Android

Mappen `mobile/` er en Capacitor-app, der viser web-appen fra serveren (`server.url` i `mobile/capacitor.config.json`). Rettelser i web-appen kommer derfor ud med det samme – en ny build er kun nødvendig ved ændringer i selve app-skallen (ikon, navn, tilladelser).

- Bundle ID: `dk.sableandmons.mealmentor`
- Navn: Meal Mentor AI
- Ikon og splash: `mobile/assets/` → `npm run icons`

Byg på Mac: `cd mobile && npm install && npx cap sync ios && npx cap open ios` → Xcode: vælg dit Team under Signing & Capabilities → Product → Archive → Distribute App → App Store Connect → Upload.


## Betaling (RevenueCat) – 49 kr./md. i Danmark, 8 USD/md. i udlandet

Abonnementet styres af RevenueCat. Brugerens Supabase-id er RevenueCats `app_user_id`, så ét abonnement gælder på iPhone, Android og web, og betalinger kommer ind i Sable & Mons-admin via webhooken `/api/revenuecat/apps-webhook?app=mealmentor`.

**I RevenueCat (projekt Meal Mentor AI):**
1. Produkt `mealmentor_monthly` (månedligt). Pris 49 kr. i DKK og 8 USD i resten af verden (i App Store Connect og Google Play vælges det nærmeste prisniveau).
2. Entitlement `premium` med produktet tilknyttet.
3. Offering `default` med en pakke `$rc_monthly`.
4. Tre apps i projektet: App Store (iOS), Play Store (Android) og Web Billing (kræver en Stripe-konto).
5. Webhook til `https://sableandmons.dk/api/revenuecat/apps-webhook?app=mealmentor` med samme Authorization-værdi som `RC_APPS_WEBHOOK_AUTH` i sableandmons.

**I Cloudflare (Worker `mealmentor` → Settings → Variables):** tilføj som Text (de er offentlige nøgler):
`RC_IOS_PUBLIC_KEY` (starter med `appl_`), `RC_ANDROID_PUBLIC_KEY` (`goog_`) og `RC_WEB_PUBLIC_KEY` (`rcb_`).

Uden en nøgle sker der ingen betaling på den platform: iPhone-builds uden RC-nøgle bruger Apple direkte som før, og web forbliver låst som app-side. Når `RC_WEB_PUBLIC_KEY` er sat, åbner web-appen med betalingsvæg.

iPhone/Android: kør `cd mobile && npm install && npx cap sync` og byg en ny version i Xcode/Android Studio, så RevenueCat-pluginet kommer med.
