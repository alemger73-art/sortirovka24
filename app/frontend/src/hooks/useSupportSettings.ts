import { useEffect, useState } from 'react';
import { DEFAULT_SUPPORT_SETTINGS, supportApi, type SupportSettings } from '@/lib/supportApi';

let cached: { data: SupportSettings; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export function invalidateSupportSettingsCache() {
  cached = null;
}

export function useSupportSettings() {
  const [settings, setSettings] = useState<SupportSettings>(cached?.data ?? DEFAULT_SUPPORT_SETTINGS);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cached && Date.now() - cached.at < TTL_MS) {
        setSettings(cached.data);
        setLoading(false);
        return;
      }
      try {
        const data = await supportApi.settings();
        if (cancelled) return;
        cached = { data, at: Date.now() };
        setSettings(data);
      } catch {
        if (!cancelled) setSettings(DEFAULT_SUPPORT_SETTINGS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { settings, loading, promoEnabled: settings.promo_enabled };
}
