import { Capacitor } from '@capacitor/core';
import { initPushNotifications } from '@/lib/pushNotifications';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Hide the native Capacitor splash once the in-app welcome is ready. */
export async function hideNativeSplash(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await Promise.race([SplashScreen.hide(), new Promise<void>((r) => setTimeout(r, 400))]);
  } catch {
    // ignore
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
    const [{ StatusBar, Style }, { App }] = await Promise.all([
      import('@capacitor/status-bar'),
      import('@capacitor/app'),
    ]);

    document.documentElement.classList.add('native-app');

    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);

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

    void initPushNotifications();
  } catch (error) {
    console.warn('[native] Capacitor plugins unavailable:', error);
  }
}
