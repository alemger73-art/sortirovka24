import { Capacitor } from '@capacitor/core';
import { pushApiClient } from '@/lib/pushApi';
import { onAuthChanged } from '@/lib/localAuth';

let lastRegisteredToken: string | null = null;
let listenersAttached = false;

function navigateFromPush(data: Record<string, string | undefined>) {
  const path = data?.path || data?.url;
  if (path && path.startsWith('/')) {
    window.location.href = path;
  }
}

async function registerToken(token: string) {
  if (!token || token === lastRegisteredToken) return;
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  await pushApiClient.register(token, platform);
  lastRegisteredToken = token;
}

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    if (!listenersAttached) {
      listenersAttached = true;

      PushNotifications.addListener('registration', async (event) => {
        try {
          await registerToken(event.value);
        } catch (error) {
          console.warn('[push] register failed:', error);
        }
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.warn('[push] registration error:', error);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.info('[push] received:', notification.title);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data as Record<string, string | undefined> | undefined;
        if (data) navigateFromPush(data);
      });

      onAuthChanged(async () => {
        if (lastRegisteredToken) {
          try {
            await registerToken(lastRegisteredToken);
          } catch {
            // ignore — token will re-register on next login
          }
        }
      });
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.info('[push] permission not granted');
      return;
    }

    await PushNotifications.register();
  } catch (error) {
    console.warn('[push] init skipped:', error);
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !lastRegisteredToken) return;
  try {
    await pushApiClient.unregister(lastRegisteredToken);
  } catch {
    // ignore
  }
  lastRegisteredToken = null;
}
