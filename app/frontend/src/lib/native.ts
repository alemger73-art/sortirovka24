import { Capacitor } from '@capacitor/core';
import { initPushNotifications } from '@/lib/pushNotifications';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
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

    await StatusBar.setStyle({ style: Style.Dark });
    await SplashScreen.hide();

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

    await initPushNotifications();
  } catch (error) {
    console.warn('[native] Capacitor plugins unavailable:', error);
  }
}
