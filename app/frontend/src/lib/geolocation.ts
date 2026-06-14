import { Capacitor } from '@capacitor/core';

export type GeoCoords = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export type LocationPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

export class GeolocationError extends Error {
  constructor(
    message: string,
    public readonly code: 'denied' | 'unsupported' | 'failed'
  ) {
    super(message);
    this.name = 'GeolocationError';
  }
}

function mapNativePermission(location: string): LocationPermissionStatus {
  if (location === 'granted') return 'granted';
  if (location === 'denied') return 'denied';
  if (location === 'prompt' || location === 'prompt-with-rationale') return 'prompt';
  return 'unsupported';
}

/** Check permission without prompting. */
export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.checkPermissions();
      return mapNativePermission(perm.location);
    } catch {
      return 'unsupported';
    }
  }

  if (!navigator.geolocation) return 'unsupported';

  if (navigator.permissions?.query) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (result.state === 'granted') return 'granted';
      if (result.state === 'denied') return 'denied';
      return 'prompt';
    } catch {
      /* Permissions API unavailable — fall through */
    }
  }

  return 'prompt';
}

/**
 * Show the system location permission dialog (native) or browser prompt (web).
 * Call on screen open so the user does not need to tap GPS first.
 */
export async function ensureLocationPermission(): Promise<LocationPermissionStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      let perm = await Geolocation.checkPermissions();

      if (perm.location !== 'granted') {
        perm = await Geolocation.requestPermissions();
      }

      return mapNativePermission(perm.location);
    } catch {
      return 'unsupported';
    }
  }

  if (!navigator.geolocation) return 'unsupported';

  const current = await getLocationPermissionStatus();
  if (current === 'granted') return 'granted';
  if (current === 'denied') return 'denied';

  // Web: the permission dialog appears on first getCurrentPosition call.
  try {
    await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 120000,
      });
    });
    return 'granted';
  } catch (err) {
    const code = (err as GeolocationPositionError)?.code;
    if (code === 1) return 'denied';
    return 'prompt';
  }
}

export async function requestCurrentPosition(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}): Promise<GeoCoords> {
  const { enableHighAccuracy = true, timeout = 15000, maximumAge = 60000 } = options ?? {};

  const permission = await ensureLocationPermission();
  if (permission === 'denied') {
    throw new GeolocationError('Location permission denied', 'denied');
  }
  if (permission === 'unsupported') {
    throw new GeolocationError('Geolocation not supported', 'unsupported');
  }
  if (permission === 'prompt') {
    throw new GeolocationError('Location permission not granted', 'denied');
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy,
        timeout,
        maximumAge,
      });

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch (err) {
      const msg = String((err as Error)?.message || err).toLowerCase();
      if (msg.includes('denied') || msg.includes('permission')) {
        throw new GeolocationError('Location permission denied', 'denied');
      }
      throw new GeolocationError('Failed to get location', 'failed');
    }
  }

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy,
        timeout,
        maximumAge,
      });
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  } catch (err) {
    const geoErr = err as GeolocationPositionError;
    if (geoErr?.code === 1) {
      throw new GeolocationError('Location permission denied', 'denied');
    }
    throw new GeolocationError('Failed to get location', 'failed');
  }
}
