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

export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

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
