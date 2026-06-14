import { Capacitor } from '@capacitor/core';

export type GeoCoords = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export class GeolocationError extends Error {
  constructor(
    message: string,
    public readonly code: 'denied' | 'unsupported' | 'failed'
  ) {
    super(message);
    this.name = 'GeolocationError';
  }
}

export async function requestCurrentPosition(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}): Promise<GeoCoords> {
  const { enableHighAccuracy = true, timeout = 15000, maximumAge = 60000 } = options ?? {};

  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      let perm = await Geolocation.checkPermissions();

      if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
        perm = await Geolocation.requestPermissions();
      }

      if (perm.location !== 'granted') {
        throw new GeolocationError('Location permission denied', 'denied');
      }

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
      if (err instanceof GeolocationError) throw err;
      const msg = String((err as Error)?.message || err).toLowerCase();
      if (msg.includes('denied') || msg.includes('permission')) {
        throw new GeolocationError('Location permission denied', 'denied');
      }
      throw new GeolocationError('Failed to get location', 'failed');
    }
  }

  if (!navigator.geolocation) {
    throw new GeolocationError('Geolocation not supported', 'unsupported');
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
