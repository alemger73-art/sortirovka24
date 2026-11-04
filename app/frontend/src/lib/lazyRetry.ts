/**
 * After a new release the old page parts (chunks) disappear from the server. A visitor who still has
 * the old page open then gets «Importing a module script failed» on the next tap. Instead of an error
 * screen we quietly reload the page once — the fresh version loads and the tap works.
 */
import { lazy, type ComponentType } from 'react';

const KEY = 's24_chunk_reload_at';
let reloading = false;
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
  reloading = true;
  void Promise.race([Promise.all([fresh, worker]), timeout]).then(() => window.location.reload());
  return true;
}

/** A page part that never arrives: the page is reloading, so nothing is drawn meanwhile. */
const whileReloading = <M,>() => new Promise<M>(() => { /* page is reloading */ });

export function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => factory().then((mod) => {
    // When the preload of a page part fails, installChunkReload() swallows the error to reload the page,
    // and the import then resolves empty. Without this check React reads `.default` of undefined.
    if (mod?.default) return mod;
    if (reloading || reloadForNewRelease()) return whileReloading<{ default: T }>();
    throw new Error('Importing a module script failed: the page part came back empty');
  }, (err) => {
    if (isChunkError(err) && (reloading || reloadForNewRelease())) return whileReloading<{ default: T }>();
    throw err;
  }));
}

/** Vite reports failed preloads of page parts with this event; same treatment. */
export function installChunkReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewRelease()) event.preventDefault();
  });
}
