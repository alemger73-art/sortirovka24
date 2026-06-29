import { Capacitor } from '@capacitor/core';
import { registerAdminPushDevice } from '@/lib/adminPushApi';

let registeredToken: string | null = null;
let listenersBound = false;

function pushEnabledInBuild(): boolean {
  return import.meta.env.VITE_ENABLE_NATIVE_PUSH === 'true';
}

function navigateAdminFromPush(path: string): void {
  try {
    const url = new URL(path, window.location.origin);
    const tab = url.searchParams.get('tab') || url.searchParams.get('admin_tab');
    if (tab) {
      const current = new URL(window.location.href);
      current.pathname = '/admin';
      current.searchParams.set('tab', tab);
      window.history.pushState({}, '', current.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    if (url.pathname !== window.location.pathname) {
      window.history.pushState({}, '', url.pathname + url.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  } catch {
    // ignore malformed paths
  }
}

async function bindAdminPushListeners(): Promise<void> {
  if (listenersBound) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  await PushNotifications.addListener('registration', async (token) => {
    registeredToken = token.value;
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
    try {
      await registerAdminPushDevice(token.value, platform);
      console.info('[admin-push] device registered');
    } catch (err) {
      console.warn('[admin-push] register failed:', err);
    }
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[admin-push] registration error:', err);
  });

  await PushNotifications.addListener('pushNotificationReceived', () => {
    import('@/lib/adminSummaryApi').then(({ notifyAdminSummaryRefresh }) => {
      notifyAdminSummaryRefresh();
    }).catch(() => {});
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const path = action.notification.data?.path;
    const tab = action.notification.data?.admin_tab;
    if (typeof path === 'string') {
      navigateAdminFromPush(path);
    } else if (typeof tab === 'string') {
      navigateAdminFromPush(`/admin?tab=${tab}`);
    }
  });

  listenersBound = true;
}

/** Register admin APK for operational FCM alerts (after login). */
export async function initAdminPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!pushEnabledInBuild()) return;

  const token = localStorage.getItem('_sp924_token') || localStorage.getItem('token');
  if (!token) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await bindAdminPushListeners();

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      const requested = await PushNotifications.requestPermissions();
      if (requested.receive !== 'granted') return;
    } else if (perm.receive !== 'granted') {
      return;
    }

    await PushNotifications.register();

    if (registeredToken) {
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
      await registerAdminPushDevice(registeredToken, platform);
    }
  } catch (err) {
    console.warn('[admin-push] init failed:', err);
  }
}

export async function relinkAdminPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !pushEnabledInBuild() || !registeredToken) return;
  try {
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
    await registerAdminPushDevice(registeredToken, platform);
  } catch {
    // best-effort
  }
}
