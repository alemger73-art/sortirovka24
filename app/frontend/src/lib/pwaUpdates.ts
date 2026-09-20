import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keep the installed web app on the current release.
 * Native Capacitor builds disable VitePWA and tree-shake this registration away.
 */
export function initWebAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisteredSW(_scriptUrl, registration) {
      if (!registration) return;

      void registration.update();
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.warn('[pwa] Service worker registration failed:', error);
    },
  });
}
