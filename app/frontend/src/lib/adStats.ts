/**
 * Real ad statistics: list impressions, opens, calls, WhatsApp, shares and saves.
 * Each browser has its own random id; the server counts one action per person per day
 * and ignores bots and the ad owner's own clicks. Events are sent in small batches.
 */
import { apiUrl } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';
import { visitorId as analyticsVisitorId } from '@/lib/analytics';

export type AdEventKind = 'impression' | 'view' | 'phone' | 'whatsapp' | 'share';

/** The site's anonymous visitor id (shared with lib/analytics). */
export function visitorId(): string {
  return analyticsVisitorId();
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccountToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

let queue: { id: number; kind: AdEventKind }[] = [];
const sentToday = new Set<string>();
let timer: number | undefined;

function flush() {
  if (timer) { window.clearTimeout(timer); timer = undefined; }
  if (!queue.length) return;
  const events = queue.splice(0, 80);
  const body = JSON.stringify({ visitor: visitorId(), events });
  try {
    void fetch(apiUrl('/api/v1/entities/announcements/events'), { method: 'POST', headers: headers(), body, keepalive: true }).catch(() => {});
  } catch { /* statistics must never break the page */ }
  if (queue.length) flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

/** Count an action; repeats in the same session are dropped before they reach the server. */
export function adEvent(id: number | string, kind: AdEventKind, now = false) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return;
  const key = `${n}:${kind}`;
  if (sentToday.has(key)) return;
  sentToday.add(key);
  queue.push({ id: n, kind });
  if (now || queue.length >= 40) flush();
  else if (!timer) timer = window.setTimeout(flush, 2000);
}

export function adSaved(id: number | string, saved: boolean) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return;
  try {
    void fetch(apiUrl(`/api/v1/entities/announcements/${n}/save`), { method: 'POST', headers: headers(), body: JSON.stringify({ visitor: visitorId(), saved }), keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

/** Calls onSeen once when at least half of the element has been on screen for a moment. */
export function observeImpression(el: Element, onSeen: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let shown: number | undefined;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { shown = window.setTimeout(() => { onSeen(); io.disconnect(); }, 600); }
      else if (shown) { window.clearTimeout(shown); shown = undefined; }
    }
  }, { threshold: 0.5 });
  io.observe(el);
  return () => { if (shown) window.clearTimeout(shown); io.disconnect(); };
}
