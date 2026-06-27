import { Capacitor } from '@capacitor/core';
import { pushApiClient } from '@/lib/pushApi';

let registeredToken: string | null = null;
let listenersBound = false;

function pushEnabledInBuild(): boolean {
  return import.meta.env.VITE_ENABLE_NATIVE_PUSH === 'true';
}

function navigateToPath(path: string): void {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (window.location.pathname !== target) {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

async function bindPushListeners(): Promise<void> {
  if (listenersBound) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  await PushNotifications.addListener('registration', async (token) => {
    registeredToken = token.value;
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
    try {
      await pushApiClient.register(token.value, platform);
      console.info('[push] device registered');
    } catch (err) {
      console.warn('[push] register API failed:', err);
    }
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration error:', err);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const path = action.notification.data?.path;
    if (typeof path === 'string' && path.startsWith('/')) {
      navigateToPath(path);
    }
  });

  listenersBound = true;
}

/**
 * Native push via Firebase + FCM. Requires:
 * - google-services.json (Android) / GoogleService-Info.plist (iOS)
 * - FCM_SERVER_KEY on Railway
 * - VITE_ENABLE_NATIVE_PUSH=true in .env.mobile + APK rebuild
 */
export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!pushEnabledInBuild()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await bindPushListeners();

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      const requested = await PushNotifications.requestPermissions();
      if (requested.receive !== 'granted') {
        console.info('[push] permission denied');
        return;
      }
    } else if (perm.receive !== 'granted') {
      return;
    }

    await PushNotifications.register();
  } catch (err) {
    console.warn('[push] init failed (Firebase configured?):', err);
  }
}

export async function linkPushTokenToAccount(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !pushEnabledInBuild() || !registeredToken) return;
  try {
    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
    await pushApiClient.register(registeredToken, platform);
  } catch (err) {
    console.warn("[push] relink to account failed:", err);
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!registeredToken) return;
  try {
    await pushApiClient.unregister(registeredToken);
  } catch {
    // best-effort
  }
  registeredToken = null;
}
