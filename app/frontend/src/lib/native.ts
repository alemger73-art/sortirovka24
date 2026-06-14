import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

async function hideSplashWithFallback(SplashScreen: { hide: () => Promise<void> }) {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 600));
  try {
    await Promise.race([SplashScreen.hide(), timeout]);
  } catch {
    // ignore — splash auto-hides via config
  }
}

async function clearLegacyWebCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // non-critical — stale SW cleanup is best-effort
  }
}

export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Old PWA service workers can serve broken JS after APK updates.
  void clearLegacyWebCaches();

  try {
    const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
      import('@capacitor/app'),
    ]);

    document.documentElement.classList.add('native-app');

    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    await hideSplashWithFallback(SplashScreen);

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        document.documentElement.classList.remove('app-background');
      } else {
        document.documentElement.classList.add('app-background');
      }
    });

    // Push requires google-services.json — init in background, never block startup.
    import('@/lib/pushNotifications')
      .then(({ initPushNotifications }) => initPushNotifications())
      .catch(() => undefined);
  } catch (error) {
    console.warn('[native] Capacitor plugins unavailable:', error);
  }
}
