import { useEffect, useState } from 'react';
import { taxiApi } from '@/lib/taxiApi';

let cached: { enabled: boolean; at: number } | null = null;
const TTL_MS = 60_000;

export async function fetchTaxiEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.enabled;
  }
  try {
    const settings = await taxiApi.settings();
    cached = { enabled: settings.enabled, at: Date.now() };
    return settings.enabled;
  } catch {
    return false;
  }
}

/** Invalidate cache after admin toggles taxi on/off */
export function invalidateTaxiEnabledCache() {
  cached = null;
}

export function useTaxiEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(cached?.enabled ?? null);

  useEffect(() => {
    let cancelled = false;
    fetchTaxiEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
