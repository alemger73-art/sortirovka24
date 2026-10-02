function safePath(raw) {
  const fallback = '/cabinet?tab=notifications';
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020]/.test(raw)) return fallback;
  try { const url = new URL(raw, self.location.origin); return url.origin === self.location.origin ? url.pathname + url.search + url.hash : fallback; } catch { return fallback; }
}
const OFFLINE_CACHE = 's24-offline-v1';
const CLICK_CACHE = 's24-pwa-click-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html', '/icon-192-v2.png'])));
});
// All navigations reach the server for current SEO/status codes. Only genuine
// network failure gets an explicit offline document, never cached order data.
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'PWA_VERSION') event.ports[0]?.postMessage({ version: 's24-pwa-20261002' });
  if (event.data?.type === 'PWA_CLIENT_READY') event.waitUntil((async () => {
    const cache = await caches.open(CLICK_CACHE);
    const pending = await cache.match('/__pwa_push_click');
    if (pending) {
      await cache.delete('/__pwa_push_click');
      if (Date.now() - Number(await pending.text()) < 300000) event.source?.postMessage({ type: 'PUSH_CLICKED' });
    }
  })());
});
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title : 'Sortirovka 24';
  const body = typeof payload.body === 'string' ? payload.body : 'У вас новое уведомление';
  const rawPath = payload.data && typeof payload.data.path === 'string' ? payload.data.path : '/cabinet?tab=notifications';
  const path = safePath(rawPath);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192-v2.png',
    badge: '/icon-maskable-192-v2.png',
    data: { path },
    tag: payload.data && payload.data.event_key ? String(payload.data.event_key) : undefined,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawPath = event.notification.data && event.notification.data.path;
  const path = safePath(rawPath);
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    // A boolean/time marker survives a worker restart. No order/customer data
    // is stored. The launched page consumes it and records click analytics.
    const cache = await caches.open(CLICK_CACHE);
    await cache.put('/__pwa_push_click', new Response(String(Date.now())));
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        try { await client.navigate(targetUrl); await client.focus(); return; } catch { /* A discarded window may no longer be navigable. */ }
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
