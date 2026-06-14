import { Capacitor } from '@capacitor/core';

/**
 * Push is disabled until Firebase is configured (google-services.json + FCM_SERVER_KEY).
 * Re-install @capacitor/push-notifications and set VITE_ENABLE_NATIVE_PUSH=true to enable.
 */
export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (import.meta.env.VITE_ENABLE_NATIVE_PUSH === 'true') {
    console.info('[push] Native push plugin not bundled — add Firebase config and rebuild APK.');
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  // no-op until push plugin is enabled
}
