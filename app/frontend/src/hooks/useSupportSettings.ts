import { useEffect, useState } from 'react';
import {
  DEFAULT_SUPPORT_SETTINGS,
  getSupportSettingsCache,
  setSupportSettingsCache,
  supportApi,
  type SupportSettings,
} from '@/lib/supportApi';

const TTL_MS = 5 * 60 * 1000;

export { invalidateSupportSettingsCache } from '@/lib/supportApi';

export function useSupportSettings() {
  const cached = getSupportSettingsCache();
  const [settings, setSettings] = useState<SupportSettings>(cached?.data ?? DEFAULT_SUPPORT_SETTINGS);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const hit = getSupportSettingsCache();
      if (hit && Date.now() - hit.at < TTL_MS) {
        setSettings(hit.data);
        setLoading(false);
        return;
      }
      try {
        const data = await supportApi.settings();
        if (cancelled) return;
        setSupportSettingsCache(data);
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
