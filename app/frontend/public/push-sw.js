self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title : 'Sortirovka 24';
  const body = typeof payload.body === 'string' ? payload.body : 'У вас новое уведомление';
  const rawPath = payload.data && typeof payload.data.path === 'string' ? payload.data.path : '/cabinet/notifications';
  const path = rawPath.startsWith('/') && !rawPath.startsWith('//') ? rawPath : '/cabinet/notifications';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { path },
    tag: payload.data && payload.data.event_key ? String(payload.data.event_key) : undefined,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawPath = event.notification.data && event.notification.data.path;
  const path = typeof rawPath === 'string' && rawPath.startsWith('/') && !rawPath.startsWith('//')
    ? rawPath
    : '/cabinet/notifications';
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
