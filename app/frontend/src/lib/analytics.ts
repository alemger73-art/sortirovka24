/**
 * Own anonymous statistics + error watch. A random visitor id lives in this browser only;
 * no names, phones or addresses are sent. Events are batched and sent to our server.
 */
import { getAccountToken } from './accountApi';
import { isPwaStandalone } from './pwa';
import { getAPIBaseURL } from './config';

const endpoint = () => `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/site-analytics`;
const VISITOR_KEY = 's24_vid';
const SESSION_KEY = 's24_sid';
const SESSION_IDLE_MS = 30 * 60 * 1000;
type Event = { kind: string; path?: string; referrer?: string; props?: Record<string, unknown> };
let queue: Event[] = [];
let timer: number | undefined;
let started = false;

function randomId() {
  const bytes = new Uint8Array(12);
  try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
let memoryVisitor = '';
let memorySession = { id: '', at: 0 };
export function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY) || '';
    if (!/^[a-f0-9]{24}$/.test(id)) { id = randomId(); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch { return memoryVisitor ||= randomId(); }
}
function sessionId(): string {
  const now = Date.now();
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as { id: string; at: number } | null;
    const session = saved && now - saved.at < SESSION_IDLE_MS && /^[a-f0-9]{24}$/.test(saved.id) ? saved : { id: randomId(), at: now };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: session.id, at: now }));
    return session.id;
  } catch {
    if (!memorySession.id || now - memorySession.at > SESSION_IDLE_MS) memorySession = { id: randomId(), at: now };
    memorySession.at = now;
    return memorySession.id;
  }
}

function flush(useBeacon = false) {
  if (!queue.length) return;
  const events = queue.slice(0, 30);
  queue = queue.slice(30);
  const body = JSON.stringify({ visitor: visitorId(), session: sessionId(), logged_in: !!getAccountToken(), standalone: isPwaStandalone(), events });
  try {
    // text/plain beacon: no preflight, survives closing the tab; the server reads it as JSON.
    if (useBeacon && navigator.sendBeacon?.(`${endpoint()}/collect`, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) { if (queue.length) flush(true); return; }
    void fetch(`${endpoint()}/collect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* statistics never break the page */ }
  if (queue.length) schedule();
}
function schedule() {
  if (timer !== undefined) return;
  timer = window.setTimeout(() => { timer = undefined; flush(); }, 4000);
}

const BOT = /bot|crawler|spider|HeadlessChrome|Lighthouse/i;
/** The site's own staff: the admin panel, a browser signed in to it, or one marked with s24_staff (owner's checks). */
function staff(path = location.pathname): boolean {
  if (path.startsWith('/admin')) return true;
  try { return Boolean(localStorage.getItem('_sp924_token') || localStorage.getItem('s24_staff')); } catch { return false; }
}

/** Record something a person did: track('add_to_cart', { name: 'Пепперони' }). */
export function track(kind: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || BOT.test(navigator.userAgent) || staff()) return;
  queue.push({ kind, path: location.pathname + location.search, props });
  if (queue.length >= 20) flush(); else schedule();
}

let lastPath = '';
export function trackPageView(path: string) {
  if (path === lastPath) return;
  const first = !lastPath;
  lastPath = path;
  if (BOT.test(navigator.userAgent) || staff(path)) return;
  queue.push({ kind: 'page_view', path, referrer: first ? document.referrer : undefined });
  schedule();
}

const reported = new Set<string>();
/** Error watch: tell the server when something breaks for this person (each error once per page load). */
export function reportError(error: unknown, extra = '') {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error)?.slice(0, 300) || 'Unknown error');
    const message = `${err.name || 'Error'}: ${err.message || ''}${extra ? ` (${extra})` : ''}`.slice(0, 2000);
    if (/ResizeObserver loop|Script error\.?$|Non-Error promise rejection captured|AbortError/i.test(message) || reported.has(message)) return;
    reported.add(message);
    const body = JSON.stringify({ message, stack: (err.stack || '').slice(0, 8000), path: location.pathname + location.search,
      release: String(import.meta.env.VITE_APP_BUILD_ID || '').slice(0, 40), visitor: visitorId() });
    void fetch(`${endpoint()}/error`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* never throw from the error reporter */ }
}

export function initAnalytics() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('error', e => { if (e.error || e.message) reportError(e.error || e.message, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : ''); });
  window.addEventListener('unhandledrejection', e => reportError(e.reason));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', () => flush(true));
  // Install / push events already exist for PWA analytics: mirror them into the statistics.
  window.addEventListener('s24:pwa-analytics', e => {
    const detail = (e as CustomEvent<{ event?: string }>).detail;
    if (detail?.event) track(detail.event === 'push_subscription_created' ? 'push_enabled' : detail.event);
  });
}
