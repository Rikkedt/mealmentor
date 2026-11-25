/* Sprog: vælg / eller /en/ ud fra valg eller telefonens sprog */
(function(){try{if(location.protocol==='file:')return;const p=location.pathname,onEn=/^\/en(\/|$)/.test(p);
  if(!/^\/(index\.html)?$|^\/en(\/(index\.html)?)?$/.test(p))return;
  let l=localStorage.getItem('mm-lang');if(!l)l=/^da/i.test(navigator.language||'da')?'da':'en';
  if(l==='en'&&!onEn)location.replace('/en/'+location.search+location.hash);else if(l==='da'&&onEn)location.replace('/'+location.search+location.hash);}catch(e){}})();
function daErr(e){const m=(e&&e.message)||'';let t;
  if((t=m.match(/after (\d+) seconds?/i)))return 'Vent '+t[1]+' sekunder, og prøv så igen.';
  if(/rate limit|too many/i.test(m))return 'Der er sendt for mange mails lige nu. Prøv igen om lidt.';
  if(/invalid.*email|email.*invalid|valid email/i.test(m))return 'Tjek at e-mailen er skrevet rigtigt.';
  if(/fetch|network/i.test(m))return 'Ingen forbindelse. Tjek internettet og prøv igen.';
  return 'Mailen kunne ikke sendes. Prøv igen om lidt.';}
/* Meal Mentor – kobler appen til Supabase (login + data) og /api/ai (Claude).
   Giver appen samme interface som prototypen: claude.use('sample'|'db'|'user'). */
(function () {
  let sb = null, session = null, sbUrl = '', sbAnon = '';
  const ready = (async () => {
    const c = await fetch('/api/config').then(r => r.json()); sbUrl = c.url; sbAnon = c.anon;
    sb = supabase.createClient(c.url, c.anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
    session = (await sb.auth.getSession()).data.session;
    try { const L = document.documentElement.lang === 'en' ? 'en' : 'da'; if (session && (session.user.user_metadata || {}).lang !== L) sb.auth.updateUser({ data: { lang: L } }); } catch (e) {}
    if (/[?&](code|error)=/.test(location.search) || /access_token=|error_description=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#vejleder');
    sb.auth.onAuthStateChange((ev, s) => {
      const had = !!session; session = s;
      if ((ev === 'SIGNED_IN' && !had) || ev === 'SIGNED_OUT') location.reload();
    });
  })();
  const fresh = async () => { await ready; session = (await sb.auth.getSession()).data.session; return session; };

  /* ---------- login ---------- */
  function emailDialog(note) {
    const d = document.createElement('dialog');
    d.className = 'mm-login';
    d.innerHTML = `<form method="dialog"><b>Log ind med e-mail</b><p class="mm-lead">${note ? note + ' ' : ''}Vi sender dig en kode på mail.</p>
      <input class="mm-email" type="email" required placeholder="din@mail.dk" autocomplete="email">
      <input class="mm-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Kode fra mailen" hidden>
      <div class="mm-row"><button value="cancel" formnovalidate class="ghost">Annullér</button><button class="go mm-go" value="ok">Send kode</button></div><p class="mm-msg"></p></form>`;
    document.body.append(d);
    const f = d.querySelector('form'), inp = d.querySelector('.mm-email'), code = d.querySelector('.mm-code'), msg = d.querySelector('.mm-msg'), go = d.querySelector('.mm-go'), lead = d.querySelector('.mm-lead');
    let sent = false;
    f.onsubmit = async e => {
      if (e.submitter && e.submitter.value === 'cancel') { d.close(); return; }
      e.preventDefault();
      if (inp.value.trim().toLowerCase() === 'appreview@mealmentorai.com') {
        if (code.hidden || !code.value) { sent = true; inp.readOnly = true; code.hidden = false; code.required = true; go.textContent = 'Log ind'; lead.textContent = 'Skriv koden til testkontoen.'; msg.textContent = ''; code.focus(); return; }
        msg.textContent = 'Logger ind …';
        const r = await sb.auth.signInWithPassword({ email: 'appreview@mealmentorai.com', password: code.value.trim() });
        msg.textContent = r.error ? 'Koden passer ikke.' : 'Du er logget ind.';
        return;
      }
      if (!sent && !(code.value && !code.hidden)) {
        msg.textContent = 'Sender …';
        const { error } = await sb.auth.signInWithOtp({ email: inp.value.trim(), options: { emailRedirectTo: location.origin + (document.documentElement.lang === 'en' ? '/en/' : '/'), data: { lang: document.documentElement.lang === 'en' ? 'en' : 'da' } } });
        if (error) {
          const w = ((error.message || '').match(/after (\d+) seconds?/i) || [])[1];
          if (w) {
            let n = +w; go.disabled = true;
            const tick = () => { if (code.value) { clearInterval(t); go.disabled = false; go.textContent = 'Log ind'; msg.textContent = ''; return; } if (n <= 0) { clearInterval(t); go.disabled = false; go.textContent = 'Send kode'; msg.textContent = 'Du kan sende en ny kode nu.'; return; }
              go.textContent = `Vent ${n} s`; msg.textContent = `Der er lige sendt en kode. Tjek din mail – eller vent ${n} sekunder og send en ny.`; n--; };
            const t = setInterval(tick, 1000); tick();
            code.hidden = false; code.placeholder = 'Kode fra mailen'; code.oninput = () => { if (code.value) { go.disabled = false; go.textContent = 'Log ind'; } };
            return;
          }
          msg.textContent = daErr(error); return;
        }
        sent = true; inp.readOnly = true; code.hidden = false; code.required = true; go.textContent = 'Log ind';
        lead.textContent = 'Skriv koden fra mailen her. Den kommer om et øjeblik.'; msg.textContent = ''; code.focus();
      } else {
        const t = code.value.replace(/\D/g, '');
        if (t.length < 6) { msg.textContent = 'Koden har 6 cifre.'; return; }
        msg.textContent = 'Logger ind …';
        let r = await sb.auth.verifyOtp({ email: inp.value.trim(), token: t, type: 'email' });
        if (r.error) r = await sb.auth.verifyOtp({ email: inp.value.trim(), token: t, type: 'signup' });
        msg.textContent = r.error ? 'Koden passer ikke eller er udløbet. Tjek mailen og prøv igen.' : 'Du er logget ind.';
      }
    };
    d.addEventListener('close', () => d.remove());
    d.showModal(); inp.focus();
  }
  let cfg = null;
  const providers = async () => {
    if (!cfg) { try { cfg = await fetch(`${sbUrl}/auth/v1/settings`, { headers: { apikey: sbAnon } }).then(r => r.json()); } catch (e) { cfg = {}; } }
    return (cfg && cfg.external) || {};
  };
  async function login(provider) {
    await ready;
    if (!provider || provider === 'email') return emailDialog();
    const on = await providers();
    if (!on[provider]) return emailDialog(`Login med ${provider === 'apple' ? 'Apple' : 'Google'} kommer snart. Indtil da: log ind med din e-mail.`);
    if (iosApp) {
      // I iPhone-appen bruges altid Apples eget login på telefonen – aldrig web-login (det kræver en web-opsætning hos Apple).
      try { if (provider === 'apple') return await appleNative(); if (provider === 'google' && plug('Browser')) return await googleNative(); }
      catch (e) {
        const msg = String((e && (e.message || e.code || e.errorMessage)) || e || '');
        if (/cancel|1001/i.test(msg)) return;
        console.warn('Login fejlede', provider, msg);
        emailDialog(`Login med ${provider === 'apple' ? 'Apple' : 'Google'} virkede ikke lige nu${msg ? ' (' + msg.slice(0, 80) + ')' : ''}. Log ind med din e-mail i stedet.`);
        return;
      }
    }
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } });
    if (error) emailDialog('Det virkede ikke. Log ind med din e-mail i stedet.');
  }

  /* ---------- login i iPhone-appen ---------- */
  const cap = window.Capacitor, iosApp = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.getPlatform && cap.getPlatform() === 'ios');
  const plug = n => { try { if (!iosApp || !(cap.isPluginAvailable && cap.isPluginAvailable(n))) return null; return (cap.Plugins && cap.Plugins[n]) || (cap.registerPlugin && cap.registerPlugin(n)) || null; } catch (e) { return null; } };
  // Fjern iOS' grå bjælke (pil op/ned + flueben) over tastaturet.
  try { const kb = plug('Keyboard'); if (kb) { kb.setAccessoryBarVisible({ isVisible: false }).catch(() => {}); } } catch (e) {}
  const APP_CB = 'dk.sableandmons.mealmentor://auth';
  async function appleNative() {
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), b => b.toString(16).padStart(2, '0')).join('');
    const apple = (cap.Plugins && cap.Plugins.SignInWithApple) || (cap.registerPlugin && cap.registerPlugin('SignInWithApple'));
    if (!apple) throw new Error('Apple-login findes ikke i denne version af appen');
    const r = await apple.authorize({ clientId: 'dk.sableandmons.mealmentor', redirectURI: location.origin, scopes: 'email name', nonce: hash });
    const tok = r && r.response && r.response.identityToken;
    if (!tok) throw new Error('no token');
    const { error } = await sb.auth.signInWithIdToken({ provider: 'apple', token: tok, nonce: raw });
    if (error) throw error;
    const g = r.response.givenName, f = r.response.familyName;
    if (g || f) { try { await sb.auth.updateUser({ data: { full_name: [g, f].filter(Boolean).join(' ') } }); } catch (e) {} }
  }
  async function googleNative() {
    const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: APP_CB, skipBrowserRedirect: true } });
    if (error || !data || !data.url) throw error || new Error('no url');
    await plug('Browser').open({ url: data.url, presentationStyle: 'popover' });
  }
  if (iosApp && plug('App')) ready.then(() => plug('App').addListener('appUrlOpen', async ({ url }) => {
    if (!url || url.indexOf(APP_CB) !== 0) return;
    try { plug('Browser') && await plug('Browser').close(); } catch (e) {}
    const q = new URLSearchParams((url.split('#')[1] || '') + '&' + ((url.split('?')[1] || '').split('#')[0]));
    if (q.get('access_token') && q.get('refresh_token')) { const { error } = await sb.auth.setSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token') }); if (!error) return; }
    else if (q.get('code')) { const { error } = await sb.auth.exchangeCodeForSession(q.get('code')); if (!error) return; }
    emailDialog('Login med Google virkede ikke. Log ind med din e-mail i stedet.');
  }));

  /* ---------- push ---------- */
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const swReg = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
  const authH = async () => { const s = await fresh(); if (!s) throw Object.assign(new Error('login'), { code: 'login' }); return { authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json' }; };
  let lastPlan = '';
  const mmPush = {
    async state() {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return 'native-soon';
      if (!pushOK()) return isIOS && !standalone ? 'ios-browser' : 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      const r = await navigator.serviceWorker.getRegistration('/'); const sub = r && await r.pushManager.getSubscription();
      return sub ? 'on' : 'off';
    },
    async enable(plan) {
      if (!pushOK()) throw Object.assign(new Error('unsupported'), { code: isIOS && !standalone ? 'ios-browser' : 'unsupported' });
      const p = await Notification.requestPermission(); if (p !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' });
      const reg = await swReg();
      const { key } = await fetch('/api/push/key').then(r => r.json());
      const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), c => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      lastPlan = '';
      await mmPush.sync(plan, sub, true);
    },
    async disable() {
      const r = await navigator.serviceWorker.getRegistration('/'); const sub = r && await r.pushManager.getSubscription();
      if (sub) { try { await fetch('/api/push/off', { method: 'POST', headers: await authH(), body: JSON.stringify({ endpoint: sub.endpoint }) }); } catch (e) {} await sub.unsubscribe(); }
    },
    async sync(plan, sub, force) {
      if (!pushOK()) return;
      if (!sub) { const r = await navigator.serviceWorker.getRegistration('/'); sub = r && await r.pushManager.getSubscription(); }
      if (!sub) return;
      const date = new Date().toLocaleDateString('sv-SE');
      const body = JSON.stringify({ sub: sub.toJSON(), plan, date, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const sig = JSON.stringify([plan, date]);
      if (!force && sig === lastPlan) return; lastPlan = sig;
      const r = await fetch('/api/push/sync', { method: 'POST', headers: await authH(), body });
      if (!r.ok) { lastPlan = ''; throw new Error('sync'); }
    },
    async test() { const r = await fetch('/api/push/test', { method: 'POST', headers: await authH() }); return r.ok; }
  };
  window.mmPush = mmPush;
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration('/').then(r => { if (r) r.update(); }).catch(() => {});
  window.mmAuth = { ready, login, logout: async () => { await ready; await sb.auth.signOut(); },
    canApple: () => !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SignInWithApple),
    deleteAccount: async () => { await ready; const { error } = await sb.rpc('delete_my_account'); if (error) throw error; try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} }, user: () => session && session.user };

  /* ---------- data ---------- */
  const col = {
    async get() {
      const s = await fresh(); if (!s) throw Object.assign(new Error('login'), { code: 'login' });
      const { data, error } = await sb.from('docs').select('id,body');
      if (error) throw error;
      return { docs: data.map(r => ({ id: r.id, data: () => r.body })) };
    },
    doc(id) {
      return {
        async set(body) { const s = await fresh(); const { error } = await sb.from('docs').upsert({ user_id: s.user.id, id, body, updated_at: new Date().toISOString() }); if (error) throw error; },
        async delete() { const s = await fresh(); const { error } = await sb.from('docs').delete().eq('user_id', s.user.id).eq('id', id); if (error) throw error; }
      };
    },
    onSnapshot(cb) {
      const run = async () => { try { const sn = await col.get(); cb({ ...sn, metadata: { hasPendingWrites: false, fromCache: false } }); } catch (e) {} };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
      const t = setInterval(run, 60000);
      return () => clearInterval(t);
    }
  };
  const db = { collection: () => col };
  const user = {
    async id() { const s = await fresh(); return s ? s.user.id : null; },
    async me() { const s = await fresh(); const u = s && s.user; return u ? { name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || '' } : null; }
  };

  /* ---------- AI ---------- */
  const toB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ type: b.type || 'image/jpeg', data: String(r.result).split(',')[1] }); r.onerror = rej; r.readAsDataURL(b); });
  async function call(input, o = {}) {
    const s = await fresh();
    if (!s) throw Object.assign(new Error('login'), { code: 'login' });
    const images = await Promise.all((o.images || []).map(toB64));
    const body = { tier: o.modelTier || 'quick', images, json: !!o.json, system: o.system || undefined, ...(typeof input === 'string' ? { prompt: input } : { messages: input }) };
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body), signal: o.signal });
    if (r.status === 429) { const t = await r.text().catch(() => ''); throw Object.assign(new Error('rate'), { code: t === 'limit' ? 'daily_limit' : t === 'photo_limit' ? 'photo_limit' : 'rate_limited' }); }
    if (r.status === 401) throw Object.assign(new Error('login'), { code: 'login' });
    if (!r.ok) throw new Error('ai ' + r.status);
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try { const ev = JSON.parse(line.slice(5)); if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { text += ev.delta.text; if (o.onText) o.onText({ text }); } else if (ev.type === 'error') throw new Error(ev.error && ev.error.message); } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
      }
    }
    return { text };
  }
  const sample = (input, o) => call(input, o);
  sample.json = async (input, o = {}) => {
    const r = await call(String(input) + '\n\nSvar KUN med gyldig JSON – ingen forklaring og ingen markdown.', { ...o, json: true, onText: null });
    const m = r.text.match(/[\[{][\s\S]*[\]}]/);
    return JSON.parse(m ? m[0] : r.text);
  };

  window.claude = { use: async name => { await ready.catch(() => {}); return name === 'sample' ? sample : name === 'db' ? db : name === 'user' ? user : null; } };
})();

/* Auto-opdatering: tjek om der er en ny version, når appen kommer frem igen */
(function () {
  const mine = () => (document.querySelector('meta[name="mm-version"]') || {}).content;
  let busy = false;
  async function check() {
    if (busy || document.hidden || !mine()) return; busy = true;
    try {
      const v = (await fetch('/version.txt?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '')).trim();
      const open = document.querySelector('dialog[open], .sheet:not([hidden])');
      if (v && v !== mine() && !open) location.reload();
    } catch (e) {} busy = false;
  }
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  setTimeout(check, 3000); setInterval(check, 5 * 60 * 1000);
})();

/* Abonnement: 49 kr./md. i Danmark, 8 USD/md. i udlandet, via RevenueCat.
   - iPhone og Android: RevenueCat-pluginet (App Store / Google Play). Ældre app-builds uden pluginet bruger stadig Apple direkte.
   - Web: RevenueCat Web Billing (kort, Apple Pay, Google Pay). Slås til, når RC_WEB_PUBLIC_KEY er sat i Cloudflare.
   Brugerens Supabase-id er RevenueCats app_user_id, så ét abonnement gælder overalt. */
(function () {
  const cap = window.Capacitor, native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const platform = native && cap.getPlatform ? cap.getPlatform() : 'web';
  const EN = document.documentElement.lang === 'en';
  const T = (da, en) => EN ? en : da;
  const PRODUCT = 'mealmentor_monthly', ENTITLEMENT = 'premium';
  const CK = 'mm-sub-until';
  const cachedOk = () => { try { return +localStorage.getItem(CK) > Date.now(); } catch (e) { return false; } };
  const remember = until => { try { if (until) localStorage.setItem(CK, String(until)); else localStorage.removeItem(CK); } catch (e) {} };
  const cfgP = fetch('/api/config').then(r => r.json()).catch(() => ({}));

  /* ---- udbyder: iPhone/Android via RevenueCat ---- */
  function rcNative(key) {
    const P = cap.registerPlugin('Purchases');
    let ready = null, pkg = null, info = null;
    const init = () => ready || (ready = (async () => {
      const u = window.mmAuth.user();
      await P.configure({ apiKey: key, appUserID: u.id });
    })());
    const read = ci => {
      info = ci;
      const e = ci && ci.entitlements && ci.entitlements.active && ci.entitlements.active[ENTITLEMENT];
      const until = e ? (e.expirationDate ? Date.parse(e.expirationDate) : Date.now() + 3600e3) : 0;
      remember(until); return !!e;
    };
    return {
      store: platform === 'android' ? 'google' : 'apple',
      async active() { try { await init(); return read((await P.getCustomerInfo()).customerInfo); } catch (e) { return cachedOk(); } },
      async offer() {
        try {
          await init();
          const o = await P.getOfferings(), off = o.current || (o.all && o.all.default);
          pkg = off && (off.availablePackages || []).find(x => x.packageType === 'MONTHLY') || (off && (off.availablePackages || [])[0]) || null;
        } catch (e) { pkg = null; }
        return pkg && { price: pkg.product.priceString, trial: !!pkg.product.introPrice };
      },
      async buy() { await init(); const r = await P.purchasePackage({ aPackage: pkg }); return read(r.customerInfo); },
      async restore() { await init(); return read((await P.restorePurchases()).customerInfo); },
      manage() { const u = info && info.managementURL; if (u) window.open(u, '_blank'); }
    };
  }

  /* ---- udbyder: web via RevenueCat Web Billing ---- */
  function rcWeb(key) {
    let rc = null, pkg = null, info = null;
    const loadScript = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('rc')); document.head.append(s); });
    const init = async () => {
      if (rc) return rc;
      if (!window.Purchases) await loadScript('/vendor/purchases-1.72.0.umd.js');
      const u = window.mmAuth.user();
      rc = window.Purchases.Purchases.configure({ apiKey: key, appUserId: u.id });
      return rc;
    };
    const currency = () => { let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {} return (tz === 'Europe/Copenhagen' || /^da\b/i.test(navigator.language || '')) ? 'DKK' : 'USD'; };
    const read = ci => {
      info = ci;
      const e = ci && ci.entitlements && ci.entitlements.active && ci.entitlements.active[ENTITLEMENT];
      const until = e ? (e.expirationDate ? Date.parse(e.expirationDate) : Date.now() + 3600e3) : 0;
      remember(until); return !!e;
    };
    return {
      store: 'web',
      async active() { try { return read(await (await init()).getCustomerInfo()); } catch (e) { return cachedOk(); } },
      async offer() {
        try {
          const o = await (await init()).getOfferings({ currency: currency() }), off = o.current || (o.all && o.all.default);
          pkg = off && (off.availablePackages || []).find(x => x.identifier === '$rc_monthly') || (off && (off.availablePackages || [])[0]) || null;
        } catch (e) { pkg = null; }
        const p = pkg && (pkg.webBillingProduct || pkg.rcBillingProduct);
        return pkg && { price: (p && p.currentPrice && p.currentPrice.formattedPrice) || '', trial: false };
      },
      async buy() {
        const u = window.mmAuth.user();
        try { await (await init()).purchase({ rcPackage: pkg, customerEmail: u && u.email, selectedLocale: EN ? 'en' : 'da', defaultLocale: EN ? 'en' : 'da' }); }
        catch (e) { if (e && (e.errorCode === 1 || /cancel/i.test(String(e.name) + String(e.message)))) return false; throw e; }
        return this.active();
      },
      async restore() { return this.active(); },
      manage() { const u = info && info.managementURL; if (u) window.open(u, '_blank'); }
    };
  }

  /* ---- udbyder: ældre iPhone-builds (Apple direkte) ---- */
  function appleLegacy() {
    const P = (cap.Plugins && cap.Plugins.NativePurchases) || cap.registerPlugin('NativePurchases');
    let product = null;
    return {
      store: 'apple',
      async active() {
        try {
          const r = await P.getPurchases({ productType: 'subs', onlyCurrentEntitlements: true });
          const now = Date.now();
          const t = (r.purchases || []).filter(p => p.productIdentifier === PRODUCT && (p.isActive || (p.expirationDate && Date.parse(p.expirationDate) > now)));
          const until = t.reduce((m, p) => Math.max(m, p.expirationDate ? Date.parse(p.expirationDate) : now + 3600e3), 0);
          remember(until); return !!until;
        } catch (e) { return cachedOk(); }
      },
      async offer() {
        try { const r = await P.getProducts({ productIdentifiers: [PRODUCT], productType: 'subs' }); product = (r.products || [])[0] || null; } catch (e) {}
        return product && { price: product.priceString, trial: !!(product.introductoryPrice && product.introEligibility === 2) };
      },
      async buy() {
        const u = window.mmAuth && window.mmAuth.user();
        await P.purchaseProduct({ productIdentifier: PRODUCT, productType: 'subs', quantity: 1, ...(u ? { appAccountToken: u.id } : {}) });
        return this.active();
      },
      async restore() { try { await P.restorePurchases(); } catch (e) {} return this.active(); },
      manage() { P.manageSubscriptions(); }
    };
  }

  function lockPage() {
    const show = () => {
      const d = document.createElement('div'); d.className = 'mm-gate';
      d.innerHTML = `<div class="mm-gate-in"><img src="/icon-192.png" alt="" width="72" height="72"><h1>Meal Mentor AI</h1>
        <p>${T('Meal Mentor AI er en mad-mentor med AI. Tag et billede af maden og få kalorier og protein, få forslag til hvornår og hvor meget du skal spise, log søvn og træn 10 minutter om dagen.', 'Meal Mentor AI is an AI food mentor. Snap a photo of your meal to get calories and protein, get suggestions for when and how much to eat, log sleep and train 10 minutes a day.')}</p>
        <p>${T('Du logger ind med Apple, Google eller e-mail. Vi bruger kun dit navn og din e-mail til at oprette din konto. Læs mere i privatlivspolitikken.', 'You sign in with Apple, Google or email. We only use your name and email to create your account. Read more in the privacy policy.')}</p>
        <p>${T('Meal Mentor AI er en app til iPhone og kommer snart i App Store.', 'Meal Mentor AI is an iPhone app and is coming soon to the App Store.')}</p>
        <p class="mm-gate-small"><a href="/privatliv/">${T('Privatlivspolitik', 'Privacy policy')}</a> · <a href="/vilkaar/">${T('Vilkår', 'Terms')}</a> · <a href="mailto:info@mealmentorai.com">info@mealmentorai.com</a></p></div>`;
      document.body.append(d); document.documentElement.classList.add('mm-locked');
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }

  async function pick() {
    const cfg = await cfgP, rc = cfg.rc || {};
    if (native) {
      const key = platform === 'android' ? rc.android : rc.ios;
      if (key && cap.isPluginAvailable && cap.isPluginAvailable('Purchases')) return rcNative(key);
      if (platform === 'ios' && cap.isPluginAvailable && cap.isPluginAvailable('NativePurchases')) return appleLegacy();
      return null;
    }
    if (location.protocol === 'file:') return null;
    /* Web: kun hvis web-betaling er sat op. ?web=1 slår web til på denne browser (til test). */
    try { if (/[?&]web=1/.test(location.search)) localStorage.setItem('mm-web', '1'); if (/[?&]web=0/.test(location.search)) localStorage.removeItem('mm-web'); } catch (e) {}
    let test = false; try { test = localStorage.getItem('mm-web') === '1'; } catch (e) {}
    if (rc.web) return rcWeb(rc.web);
    if (!test) lockPage();
    return null;
  }

  let wall = null, provider = null;
  async function showWall(o) {
    if (wall) return;
    const cancelHow = provider.store === 'apple' ? T('Du kan opsige når som helst i Indstillinger → Apple-konto → Abonnementer, senest 24 timer før næste periode.', 'Cancel any time in Settings → Apple Account → Subscriptions, at least 24 hours before the next period.')
      : provider.store === 'google' ? T('Du kan opsige når som helst i Google Play → Betalinger og abonnementer → Abonnementer.', 'Cancel any time in Google Play → Payments & subscriptions → Subscriptions.')
      : T('Du kan opsige når som helst under Administrér abonnement, senest 24 timer før næste periode.', 'Cancel any time under Manage subscription, at least 24 hours before the next period.');
    wall = document.createElement('div'); wall.className = 'mm-gate mm-pay';
    wall.innerHTML = `<div class="mm-gate-in"><img src="/icon-192.png" alt="" width="64" height="64"><h1>Meal Mentor AI</h1>
      <ul><li>${T('AI-scanning af din mad', 'AI scanning of your food')}</li><li>${T('Mentor med madforslag og påmindelser', 'Mentor with meal ideas and reminders')}</li><li>${T('Alle træningsprogrammer og lydguider', 'All training programmes and audio guides')}</li></ul>
      <p class="mm-price"></p>
      <button class="go mm-buy">${T('Fortsæt', 'Continue')}</button>
      <p class="mm-msg"></p>
      <p class="mm-gate-small">${T('Abonnementet fornyes automatisk hver måned, indtil du opsiger det. ', 'The subscription renews automatically every month until you cancel. ')}${cancelHow}</p>
      <p class="mm-gate-small"><a href="#" class="mm-restore">${T('Gendan køb', 'Restore purchases')}</a> · <a href="https://mealmentorai.com/vilkaar/">${T('Vilkår', 'Terms of Use')}</a> · <a href="https://mealmentorai.com/privatliv/">${T('Privatliv', 'Privacy')}</a> · <a href="#" class="mm-out">${T('Log ud', 'Log out')}</a></p></div>`;
    document.body.append(wall); document.documentElement.classList.add('mm-locked');
    const msg = wall.querySelector('.mm-msg'), buy = wall.querySelector('.mm-buy'), price = wall.querySelector('.mm-price');
    const ps = o.price || T('49 kr.', '$8');
    price.textContent = o.trial ? T(`7 dage gratis, derefter ${ps} om måneden`, `7 days free, then ${ps} per month`) : T(`${ps} om måneden`, `${ps} per month`);
    buy.textContent = o.trial ? T('Start 7 dage gratis', 'Start 7 days free') : T('Start abonnement', 'Subscribe');
    const done = () => { wall.remove(); wall = null; document.documentElement.classList.remove('mm-locked'); };
    buy.onclick = async () => {
      buy.disabled = true; msg.textContent = '';
      try {
        if (await provider.buy()) done();
        else if (await provider.active()) done();
        else msg.textContent = T('Købet er ikke bekræftet endnu. Prøv "Gendan køb" om lidt.', 'The purchase is not confirmed yet. Try "Restore purchases" in a moment.');
      } catch (e) {
        if (!/cancel/i.test(String((e && (e.message || e.code)) || ''))) msg.textContent = T('Købet gik ikke igennem. Prøv igen.', 'The purchase did not go through. Please try again.');
      }
      buy.disabled = false;
    };
    wall.querySelector('.mm-restore').onclick = async e => {
      e.preventDefault(); msg.textContent = T('Gendanner …', 'Restoring …');
      if (await provider.restore()) done(); else msg.textContent = T('Vi fandt intet aktivt abonnement på denne konto.', 'No active subscription was found on this account.');
    };
    wall.querySelector('.mm-out').onclick = async e => { e.preventDefault(); if (window.mmAuth) await window.mmAuth.logout(); };
  }
  async function gate() {
    if (!provider || !window.mmAuth) return;
    await window.mmAuth.ready.catch(() => {});
    if (!window.mmAuth.user()) return;
    const onb = document.getElementById('onb');
    if (onb && !onb.hidden) { new MutationObserver((m, o) => { if (onb.hidden) { o.disconnect(); gate(); } }).observe(onb, { attributes: true, attributeFilter: ['hidden'] }); return; }
    if (await provider.active()) return;
    const o = await provider.offer();
    if (!o) return; /* produktet er ikke klar endnu (fx ikke oprettet i RevenueCat): lad appen være åben */
    showWall(o);
  }
  const start = async () => {
    provider = await pick();
    if (!provider) return;
    window.mmPay = { manage: () => provider.manage(), active: () => provider.active() };
    gate();
    try { cap && cap.Plugins && cap.Plugins.App && cap.Plugins.App.addListener('resume', () => { if (!wall) gate(); }); } catch (e) {}
    const b = document.querySelector('.plans .plan button.go'); if (b) { b.disabled = false; b.textContent = T('Administrér abonnement', 'Manage subscription'); b.onclick = () => provider.manage(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
