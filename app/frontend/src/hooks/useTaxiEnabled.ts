import { useEffect, useState } from 'react';
import { taxiApi } from '@/lib/taxiApi';

let cached: { enabled: boolean; at: number } | null = null;
const TTL_MS = 10_000;

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
    const refresh = () => fetchTaxiEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      cancelled = true;
    };
  }, []);

  return enabled;
}
