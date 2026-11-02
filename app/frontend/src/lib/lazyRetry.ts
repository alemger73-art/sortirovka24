/**
 * After a new release the old page parts (chunks) disappear from the server. A visitor who still has
 * the old page open then gets «Importing a module script failed» on the next tap. Instead of an error
 * screen we quietly reload the page once — the fresh version loads and the tap works.
 */
import { lazy, type ComponentType } from 'react';

const KEY = 's24_chunk_reload_at';
let reloadPending = false;
const CHUNK_ERROR = /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk|ChunkLoadError|Unable to preload CSS/i;

export function isChunkError(err: unknown): boolean {
  return CHUNK_ERROR.test(String((err as Error)?.message || err || ''));
}

/** Reloads at most once in 30 seconds (so a real outage never turns into a reload loop). */
export function reloadForNewRelease(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* no storage: still try once */ }
  // Refresh the browser's copy of the page first, so the reload cannot land on the same old page again.
  const fresh = fetch(window.location.href, { cache: 'reload', credentials: 'same-origin' }).catch(() => undefined);
  const worker = navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => undefined);
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  reloadPending = true;
  void Promise.race([Promise.all([fresh, worker]), timeout]).then(() => window.location.reload());
  return true;
}

export function withChunkReload<T>(factory: () => Promise<{ default: T }>): () => Promise<{ default: T }> {
  return () => factory().then((mod) => {
    // Error #7: for a plain `() => import('./pages/Cabinet')` the cancelled preload error does not reject —
    // the import resolves to `undefined`, and React's lazy then fails on `undefined.default`. Same as above:
    // the page is reloading, so wait quietly.
    if (mod == null) {
      if (reloadPending || reloadForNewRelease()) return new Promise<{ default: T }>(() => { /* page is reloading */ });
      throw new Error('Loading chunk failed: empty module');
    }
    return mod;
  }, (err) => {
    // When the 'vite:preloadError' handler below cancels the error, Vite hands back an empty module, so
    // `m.AdsList` fails with «Cannot read properties of undefined». The page is already reloading: wait
    // quietly instead of showing the error screen.
    if (reloadPending) return new Promise<{ default: T }>(() => { /* page is reloading */ });
    if (isChunkError(err) && reloadForNewRelease()) return new Promise<{ default: T }>(() => { /* page is reloading */ });
    throw err;
  });
}

export function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(withChunkReload(factory));
}

/** Vite reports failed preloads of page parts with this event; same treatment. */
export function installChunkReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewRelease()) event.preventDefault();
  });
}
