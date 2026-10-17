import { isPwaStandalone, pwaPlatform } from './pwa';

export type CourierPushState = 'enabled' | 'disabled' | 'denied' | 'needs-install' | 'unsupported';

export function courierPushAvailability(): CourierPushState {
  if (pwaPlatform().ios && !isPwaStandalone()) return 'needs-install';
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission === 'denied' ? 'denied' : 'disabled';
}

async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('courier-push:not-ready')), 10000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function courierWebPushState(): Promise<CourierPushState> {
  const state = courierPushAvailability();
  if (state !== 'disabled' || Notification.permission !== 'granted') return state;
  const registration = await pushRegistration();
  return await registration.pushManager.getSubscription() ? 'enabled' : 'disabled';
}

// Call directly from the user's click: do not fetch or import before requesting permission.
export async function enableCourierWebPush(
  getKey: () => Promise<{ enabled: boolean; public_key: string }>,
  register: (subscription: PushSubscriptionJSON) => Promise<unknown>,
): Promise<void> {
  const state = courierPushAvailability();
  if (state !== 'disabled') throw new Error(`courier-push:${state}`);
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(`courier-push:${permission === 'denied' ? 'denied' : 'dismissed'}`);
  const key = await getKey();
  if (!key.enabled || !key.public_key) throw new Error('courier-push:server');
  const registration = await pushRegistration();
  const existing = await registration.pushManager.getSubscription();
  const binary = atob((key.public_key + '='.repeat((4 - key.public_key.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: Uint8Array.from(binary, c => c.charCodeAt(0)),
  });
  // Also register an existing subscription: this device may have changed courier accounts.
  await register(subscription.toJSON());
}
