import { getAccountToken } from '@/lib/accountApi';
import { getAPIBaseURL } from '@/lib/config';
import { humanizeApiError } from '@/lib/apiErrors';
import { DEFAULT_MODULES, MODULE_KEYS, type ModuleKey } from '@/config/modules';

export type ModulesMap = Record<ModuleKey, boolean>;

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

/** Admin panel uses _sp924_token; falls back to the generic token. */
function getAdminToken(): string {
  try {
    return (
      localStorage.getItem('_sp924_token') ||
      localStorage.getItem('token') ||
      getAccountToken() ||
      ''
    );
  } catch {
    return getAccountToken() || '';
  }
}

async function api<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(humanizeApiError(err));
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    let message = txt || `HTTP ${resp.status}`;
    try {
      const parsed = JSON.parse(txt);
      if (typeof parsed.detail === 'string') message = parsed.detail;
    } catch {
      /* keep raw */
    }
    throw new Error(message);
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

/** Normalize an arbitrary response into a full ModulesMap (missing keys -> true). */
function normalize(raw: unknown): ModulesMap {
  const out: ModulesMap = { ...DEFAULT_MODULES };
  if (raw && typeof raw === 'object') {
    for (const key of MODULE_KEYS) {
      const value = (raw as Record<string, unknown>)[key];
      if (value === false || value === 'false') out[key] = false;
      else if (value === true || value === 'true') out[key] = true;
    }
  }
  return out;
}

export const modulesApi = {
  /** Public: map of module -> enabled. */
  list: async (): Promise<ModulesMap> => normalize(await api<unknown>('/api/v1/modules')),

  /** Admin: raw stored settings (string values). */
  adminGet: async (): Promise<ModulesMap> =>
    normalize(await api<unknown>('/api/v1/modules/admin/settings', undefined, getAdminToken())),

  /** Admin: update flags, returns the new public map. */
  adminUpdate: async (settings: Partial<Record<ModuleKey, boolean>>): Promise<ModulesMap> =>
    normalize(
      await api<unknown>(
        '/api/v1/modules/admin/settings',
        { method: 'PUT', body: JSON.stringify({ settings }) },
        getAdminToken(),
      ),
    ),
};
