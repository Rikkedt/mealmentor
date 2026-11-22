/* Sprog: vælg / eller /en/ ud fra valg eller telefonens sprog */
(function(){try{if(location.protocol==='file:')return;const p=location.pathname,onEn=/^\/en(\/|$)/.test(p);
  if(!/^\/(index\.html)?$|^\/en(\/(index\.html)?)?$/.test(p))return;
  let l=localStorage.getItem('mm-lang');if(!l)l=/^da/i.test(navigator.language||'da')?'da':'en';
  if(l==='en'&&!onEn)location.replace('/en/'+location.search+location.hash);else if(l==='da'&&onEn)location.replace('/'+location.search+location.hash);}catch(e){}})();
function daErr(e){const m=(e&&e.message)||'';let t;
  if((t=m.match(/after (\d+) seconds?/i)))return 'Wait '+t[1]+' seconds, then try again.';
  if(/rate limit|too many/i.test(m))return 'Too many emails have been sent right now. Try again in a moment.';
  if(/invalid.*email|email.*invalid|valid email/i.test(m))return 'Check that the email is spelled correctly.';
  if(/fetch|network/i.test(m))return 'No connection. Check your internet and try again.';
  return 'The email could not be sent. Try again in a moment.';}
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
    d.innerHTML = `<form method="dialog"><b>Log in with email</b><p class="mm-lead">${note ? note + ' ' : ''}We'll email you a code.</p>
      <input class="mm-email" type="email" required placeholder="you@email.com" autocomplete="email">
      <input class="mm-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Code from the email" hidden>
      <div class="mm-row"><button value="cancel" formnovalidate class="ghost">Cancel</button><button class="go mm-go" value="ok">Send code</button></div><p class="mm-msg"></p></form>`;
    document.body.append(d);
    const f = d.querySelector('form'), inp = d.querySelector('.mm-email'), code = d.querySelector('.mm-code'), msg = d.querySelector('.mm-msg'), go = d.querySelector('.mm-go'), lead = d.querySelector('.mm-lead');
    let sent = false;
    f.onsubmit = async e => {
      if (e.submitter && e.submitter.value === 'cancel') { d.close(); return; }
      e.preventDefault();
      if (!sent && !(code.value && !code.hidden)) {
        msg.textContent = 'Sending …';
        const { error } = await sb.auth.signInWithOtp({ email: inp.value.trim(), options: { emailRedirectTo: location.origin + (document.documentElement.lang === 'en' ? '/en/' : '/'), data: { lang: document.documentElement.lang === 'en' ? 'en' : 'da' } } });
        if (error) {
          const w = ((error.message || '').match(/after (\d+) seconds?/i) || [])[1];
          if (w) {
            let n = +w; go.disabled = true;
            const tick = () => { if (code.value) { clearInterval(t); go.disabled = false; go.textContent = 'Log in'; msg.textContent = ''; return; } if (n <= 0) { clearInterval(t); go.disabled = false; go.textContent = 'Send code'; msg.textContent = 'You can send a new code now.'; return; }
              go.textContent = `Wait ${n} s`; msg.textContent = `A code was just sent. Check your email – or wait ${n} seconds and send a new one.`; n--; };
            const t = setInterval(tick, 1000); tick();
            code.hidden = false; code.placeholder = 'Code from the email'; code.oninput = () => { if (code.value) { go.disabled = false; go.textContent = 'Log in'; } };
            return;
          }
          msg.textContent = daErr(error); return;
        }
        sent = true; inp.readOnly = true; code.hidden = false; code.required = true; go.textContent = 'Log in';
        lead.textContent = 'Enter the code from the email here. It will arrive in a moment.'; msg.textContent = ''; code.focus();
      } else {
        const t = code.value.replace(/\D/g, '');
        if (t.length < 6) { msg.textContent = 'The code has 6 digits.'; return; }
        msg.textContent = 'Logging in …';
        let r = await sb.auth.verifyOtp({ email: inp.value.trim(), token: t, type: 'email' });
        if (r.error) r = await sb.auth.verifyOtp({ email: inp.value.trim(), token: t, type: 'signup' });
        msg.textContent = r.error ? 'The code doesn\'t match or has expired. Check the email and try again.' : 'You are logged in.';
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
    if (!on[provider]) return emailDialog(`Login with ${provider === 'apple' ? 'Apple' : 'Google'} is coming soon. Until then: log in with your email.`);
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } });
    if (error) emailDialog('That didn\'t work. Log in with your email instead.');
  }

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
    const body = { tier: o.modelTier || 'quick', images, json: !!o.json, ...(typeof input === 'string' ? { prompt: input } : { messages: input }) };
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
    const r = await call(String(input) + '\n\nReply ONLY with valid JSON – no explanation and no markdown.', { ...o, json: true, onText: null });
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
