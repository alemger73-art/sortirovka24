import { Capacitor } from '@capacitor/core';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let initialized = false;
let applyPendingUpdate: (() => void) | undefined;

/** Apply a waiting worker before retrying a route that belongs to an older release. */
export function applyWebAppUpdate(): void {
  if (applyPendingUpdate) applyPendingUpdate();
  else window.location.reload();
}

/** Refresh the same SW scope without deleting sessions, drafts or push subscriptions. */
export function initWebAppUpdates(): void {
  if (initialized || !import.meta.env.PROD || import.meta.env.MODE === 'mobile'
    || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
  initialized = true;
  const hadController = !!navigator.serviceWorker.controller;
  let applying = false;
  let reloading = false;
  let lastCheck = 0;
  let checking = false;
  let registration: ServiceWorkerRegistration;

  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  // No pop-ups: a waiting version is applied silently on the next in-app navigation
  // (the page changes anyway, so nothing typed is lost).
  let pending = false;
  const offerUpdate = () => { pending = true; };
  const onNavigate = () => { if (pending && applyPendingUpdate) applyPendingUpdate(); };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history);
    history[method] = ((...args: Parameters<History['pushState']>) => {
      const before = location.pathname;
      original(...args);
      if (method === 'pushState' && location.pathname !== before) onNavigate();
    }) as History['pushState'];
  }
  window.addEventListener('popstate', onNavigate);

  // A release-specific URL also bypasses an older worker cached at the CDN.
  // The scope stays '/', so existing push subscriptions remain on the registration.
  const release = encodeURIComponent(import.meta.env.VITE_APP_BUILD_ID);
  void navigator.serviceWorker.register(`/sw.js?v=${release}`, {
    scope: '/', updateViaCache: 'none',
  }).then(reg => {
    registration = reg;
    applyPendingUpdate = () => {
      if (applying || reloading) return;
      if (registration.waiting) {
        applying = true;
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else reload();
    };
    const checkWaiting = () => {
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate();
    };
    const watchInstalling = () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', checkWaiting);
    };
    reg.addEventListener('updatefound', watchInstalling);
    watchInstalling();
    checkWaiting();
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (applying) reload();
      else if (hadController) offerUpdate();
    });
    const check = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden' || checking) return;
      checkWaiting();
      if (Date.now() - lastCheck < 30_000) return;
      checking = true;
      lastCheck = Date.now();
      try { await reg.update(); } catch { /* Retry on reconnect / next foreground check. */ }
      finally { checking = false; }
    };
    document.addEventListener('visibilitychange', () => { void check(); });
    window.addEventListener('pageshow', () => { void check(); });
    window.addEventListener('online', () => { lastCheck = 0; void check(); });
    window.addEventListener('focus', () => { void check(); });
    window.setInterval(() => { void check(); }, UPDATE_CHECK_INTERVAL_MS);
    void check();
  }).catch(error => {
    initialized = false;
    console.warn('[pwa] Service worker registration failed:', error);
    window.addEventListener('online', initWebAppUpdates, { once: true });
  });
}
