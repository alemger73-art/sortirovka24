import { useCallback, useEffect, useState } from 'react';
import { MODULE_KEYS, type ModuleKey } from '@/config/modules';
import { modulesApi, type ModulesMap } from '@/lib/modulesApi';

const CLOSED_MODULES = Object.fromEntries(MODULE_KEYS.map(key => [key, false])) as ModulesMap;
let pending: Promise<ModulesMap> | null = null;
let cached: { data: ModulesMap; at: number } | null = null;
const TTL_MS = 10_000;

export async function fetchModules(): Promise<ModulesMap> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  if (!pending) {
    pending = modulesApi.list().then(data => {
      cached = { data, at: Date.now() };
      return data;
    }).catch(() => CLOSED_MODULES).finally(() => { pending = null; });
  }
  return pending;
}

/** Invalidate the cache after the admin toggles modules on/off. */
export function invalidateModulesCache() {
  cached = null;
  window.dispatchEvent(new Event("s24-modules-updated"));
}

/**
 * Returns the enabled-state map plus an `isEnabled` helper.
 * Unknown availability stays hidden until confirmed by the server.
 */
export function useModules() {
  const [modules, setModules] = useState<ModulesMap>(cached?.data ?? CLOSED_MODULES);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchModules().then((data) => {
      if (!cancelled) {
        setModules(data);
        setLoading(false);
      }
    });
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("s24-modules-updated", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("s24-modules-updated", refresh);
      cancelled = true;
    };
  }, []);

  const isEnabled = useCallback((key: ModuleKey | null | undefined): boolean => {
    if (!key) return true;
    return modules[key] === true;
  }, [modules]);

  return { modules, loading, isEnabled };
}
