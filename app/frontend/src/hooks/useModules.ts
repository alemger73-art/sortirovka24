import { useEffect, useState } from 'react';
import { DEFAULT_MODULES, type ModuleKey } from '@/config/modules';
import { modulesApi, type ModulesMap } from '@/lib/modulesApi';

let cached: { data: ModulesMap; at: number } | null = null;
const TTL_MS = 60_000;

export async function fetchModules(): Promise<ModulesMap> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  try {
    const data = await modulesApi.list();
    cached = { data, at: Date.now() };
    return data;
  } catch {
    // On failure, show everything (never hide a module because of a network hiccup).
    return cached?.data ?? DEFAULT_MODULES;
  }
}

/** Invalidate the cache after the admin toggles modules on/off. */
export function invalidateModulesCache() {
  cached = null;
}

/**
 * Returns the enabled-state map plus an `isEnabled` helper.
 * While loading, everything is treated as enabled (never flicker-hide content).
 */
export function useModules() {
  const [modules, setModules] = useState<ModulesMap>(cached?.data ?? DEFAULT_MODULES);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    fetchModules().then((data) => {
      if (!cancelled) {
        setModules(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isEnabled = (key: ModuleKey | null | undefined): boolean => {
    if (!key) return true;
    return modules[key] !== false;
  };

  return { modules, loading, isEnabled };
}
