/* Meal Mentor AI – service worker til push-beskeder */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (x) { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Meal Mentor AI', {
    body: m.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: m.key || 'mm', data: { key: m.key || '' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const key = (e.notification.data && e.notification.data.key) || '';
  const url = '/?push=' + encodeURIComponent(key) + '#vejleder';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({ push: key }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
