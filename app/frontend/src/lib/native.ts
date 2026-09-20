import { Capacitor } from '@capacitor/core';
import { initPushNotifications } from '@/lib/pushNotifications';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

const APP_LINK_HOSTS = new Set([
  'sortirovka24.kz',
  'www.sortirovka24.kz',
  'sortirovka24-production-8788.up.railway.app',
]);

/** Convert verified web links and sortirovka24:// links into an in-app route. */
export function nativeRouteFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const isWebAppLink = (url.protocol === 'https:' || url.protocol === 'http:') && APP_LINK_HOSTS.has(url.hostname);
    const isCustomLink = url.protocol === 'sortirovka24:';
    if (!isWebAppLink && !isCustomLink) return null;

    const customPath = isCustomLink
      ? `/${[url.hostname, url.pathname.replace(/^\/+/, '')].filter(Boolean).join('/')}`
      : url.pathname;
    const path = customPath.startsWith('/') ? customPath : `/${customPath}`;
    return `${path}${url.search}${url.hash}`;
  } catch {
    return null;
  }
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

  document.documentElement.classList.add('native-app');

  // Old PWA service workers can serve broken JS after APK updates.
  void clearLegacyWebCaches();

  try {
    const { App } = await import('@capacitor/app');

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

    App.addListener('appUrlOpen', ({ url }) => {
      const route = nativeRouteFromUrl(url);
      if (!route) return;
      window.history.pushState({}, '', route);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    void initPushNotifications();
  } catch (error) {
    console.warn('[native] Capacitor plugins unavailable:', error);
  }
}
