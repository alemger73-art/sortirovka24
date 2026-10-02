import { Capacitor } from '@capacitor/core';
import { pushApiClient } from '@/lib/pushApi';
import { isPwaStandalone, pwaPlatform, safeInternalPath, pwaEvent } from '@/lib/pwa';

let registeredToken: string | null = null;
let listenersBound = false;

export type PushPermissionState = 'enabled' | 'disabled' | 'denied' | 'unsupported' | 'needs-install';

function pushEnabledInBuild(): boolean {
  return import.meta.env.VITE_ENABLE_NATIVE_PUSH === 'true';
}

function navigateToPath(path: string): void {
  const target = safeInternalPath(path);
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

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const title = notification.title || 'Уведомление';
    const body = notification.body || '';
    const path = notification.data?.path;
    import('sonner').then(({ toast }) => {
      toast(title, {
        description: body || undefined,
        action: typeof path === 'string' && path.startsWith('/')
          ? { label: 'Открыть', onClick: () => navigateToPath(path) }
          : undefined,
      });
    }).catch(() => {});
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
    // Never show a system permission prompt on startup. A previous grant may
    // be restored automatically; a new grant only follows a user button click.
    if (perm.receive === 'granted') await PushNotifications.register();
  } catch (err) {
    console.warn('[push] init failed (Firebase configured?):', err);
  }
}

function isStandalone(): boolean {
  return isPwaStandalone();
}

function isIosBrowser(): boolean {
  return pwaPlatform().ios;
}

function webPushSupported(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function decodeVapidKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer as ArrayBuffer;
}

async function currentWebSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null;
  const registration = await readyForPush();
  return registration.pushManager.getSubscription();
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (Capacitor.isNativePlatform()) {
    if (!pushEnabledInBuild()) return 'unsupported';
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    return permission.receive === 'granted' ? 'enabled' : permission.receive === 'denied' ? 'denied' : 'disabled';
  }
  if (isIosBrowser() && !isStandalone()) return 'needs-install';
  if (!webPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'disabled';
  return (await currentWebSubscription()) ? 'enabled' : 'disabled';
}

export async function enablePushNotifications(): Promise<PushPermissionState> {
  if (Capacitor.isNativePlatform()) {
    if (!pushEnabledInBuild()) return 'unsupported';
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await bindPushListeners();
    const result = await PushNotifications.requestPermissions();
    if (result.receive !== 'granted') return 'denied';
    await PushNotifications.register();
    return 'enabled';
  }
  if (isIosBrowser() && !isStandalone()) return 'needs-install';
  if (!webPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  pwaEvent('push_prompt_shown');
  const permission = await Notification.requestPermission();
  pwaEvent(permission === 'granted' ? 'push_permission_granted' : 'push_permission_denied');
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'disabled';
  const key = await pushApiClient.webKey();
  if (!key.enabled || !key.public_key) throw new Error('Web Push пока не настроен на сервере');
  const registration = await readyForPush();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(key.public_key),
  });
  await pushApiClient.registerWeb(subscription.toJSON());
  pwaEvent('push_subscription_created');
  return 'enabled';
}

export async function syncWebPushSubscriptionToAccount(): Promise<void> {
  if (Capacitor.isNativePlatform() || !webPushSupported() || Notification.permission !== 'granted') return;
  const subscription = await currentWebSubscription();
  if (subscription) await pushApiClient.registerWeb(subscription.toJSON());
}

export async function disablePushNotifications(accountToken?: string): Promise<PushPermissionState> {
  if (Capacitor.isNativePlatform()) {
    await unregisterPushNotifications(accountToken);
    return 'disabled';
  }
  const subscription = await currentWebSubscription();
  if (subscription) {
    try { await pushApiClient.unregisterWeb(subscription.endpoint, accountToken); } catch { /* best effort */ }
    await subscription.unsubscribe();
  }
  return 'Notification' in window && Notification.permission === 'denied' ? 'denied' : 'disabled';
}

async function readyForPush(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Приложение ещё не готово к push. Обновите страницу и повторите.')), 10000);
    })]);
  } finally { clearTimeout(timer!); }
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

export async function unregisterPushNotifications(accountToken?: string): Promise<void> {
  if (!registeredToken) return;
  try {
    await pushApiClient.unregister(registeredToken, accountToken);
  } catch {
    // best-effort
  }
  registeredToken = null;
}
