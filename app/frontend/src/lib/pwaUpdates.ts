import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { getPublicLanguage } from '@/i18n/publicLocale';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let initialized = false;

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
  const offerUpdate = () => {
    const kz = getPublicLanguage() === 'kz';
    toast(kz ? 'Қолданбаның жаңа нұсқасы дайын' : 'Доступна новая версия приложения', {
      id: 'app-update', duration: Infinity,
      description: kz ? 'Өзгерістерді сақтап, жаңартуды басыңыз.' : 'Сохраните изменения и нажмите «Обновить».',
      action: {
        label: kz ? 'Жаңарту' : 'Обновить',
        onClick: () => {
          if (registration.waiting) {
            applying = true;
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else reload();
        },
      },
    });
  };

  // A release-specific URL also bypasses an older worker cached at the CDN.
  // The scope stays '/', so existing push subscriptions remain on the registration.
  const release = encodeURIComponent(import.meta.env.VITE_APP_BUILD_ID);
  void navigator.serviceWorker.register(`/sw.js?v=${release}`, {
    scope: '/', updateViaCache: 'none',
  }).then(reg => {
    registration = reg;
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
