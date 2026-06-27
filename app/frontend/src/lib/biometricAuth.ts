/** Biometric unlock — native app (Capacitor plugin) with graceful web fallback. */

import { Capacitor } from '@capacitor/core';

export type BiometricSupport = {
  available: boolean;
  platform: 'native' | 'web' | 'none';
  label: string;
};

export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      const info = await BiometricAuth.checkBiometry();
      const available = info.isAvailable === true;
      let label = 'Биометрия';
      if (info.biometryType === 2) label = 'Face ID';
      else if (info.biometryType === 1) label = 'Touch ID / отпечаток';
      return { available, platform: 'native', label };
    } catch {
      return { available: false, platform: 'native', label: 'Биометрия' };
    }
  }

  try {
    if (
      typeof PublicKeyCredential !== 'undefined'
      && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (ok) {
        return { available: false, platform: 'web', label: 'Windows Hello / отпечаток' };
      }
    }
  } catch {
    /* ignore */
  }

  return { available: false, platform: 'none', label: 'Биометрия недоступна' };
}

export async function authenticateBiometric(reason: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: 'Отмена',
        allowDeviceCredential: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  // Web: полноценная биометрия через WebAuthn — отдельный этап; пока только PIN в браузере.
  return false;
}
