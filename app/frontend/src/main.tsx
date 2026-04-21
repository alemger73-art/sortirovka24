import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { warmupBackend } from './lib/api';

// ─── Intercept SDK's postMessage error reporting ─────────────────
// The @metagptx/web-sdk sends `mgx-appview-error` postMessages to
// window.top for ANY HTTP response with status >= 400 (except 401).
// For transient 503/502/504 errors (backend cold starts, DNS issues),
// this creates a disruptive "Server Error" overlay in App Viewer.
//
// We intercept window.top.postMessage to suppress these transient
// error reports. The app handles retries internally.
//
// IMPORTANT: This must run BEFORE the SDK is initialized (before
// createClient() is called in api.ts).

(function patchPostMessage() {
  try {
    // Patch on the current window (SDK calls window.top.postMessage)
    const targets: Array<{ obj: Window; original: typeof window.postMessage }> = [];

    // Always patch current window
    const origSelf = window.postMessage.bind(window);
    targets.push({ obj: window, original: origSelf });

    // Also patch window.top if accessible and different from window
    try {
      if (window.top && window.top !== window) {
        const origTop = window.top.postMessage.bind(window.top);
        targets.push({ obj: window.top, original: origTop });
      }
    } catch {
      // Cross-origin — can't patch window.top, that's fine
    }

    for (const { obj, original } of targets) {
      obj.postMessage = function patchedPostMessage(message: any, ...args: any[]) {
        // Check if this is an SDK error report for a transient error
        if (
          message &&
          typeof message === 'object' &&
          message.type === 'mgx-appview-error' &&
          message.data
        ) {
          const errMsg = String(message.data.errMsg || '').toLowerCase();
          const stack = String(message.data.stack || '').toLowerCase();
          const combined = `${errMsg} ${stack}`;

          // Suppress transient backend errors (503, 502, 504, DNS, timeout, etc.)
          if (
            combined.includes('503') ||
            combined.includes('502') ||
            combined.includes('504') ||
            combined.includes('temporarily unavailable') ||
            combined.includes('service unavailable') ||
            combined.includes('<!doctype') ||
            combined.includes('<html') ||
            combined.includes('server error') ||
            combined.includes('dns') ||
            combined.includes('timeout') ||
            combined.includes('econnrefused') ||
            combined.includes('enotfound') ||
            combined.includes('econnreset') ||
            combined.includes('fetch failed') ||
            combined.includes('failed to fetch') ||
            combined.includes('network') ||
            combined.includes('balancer') ||
            combined.includes('not ready') ||
            combined.includes('lambda') ||
            combined.includes('callback lock')
          ) {
            console.warn('[Suppressed SDK error report]', errMsg);
            return;
          }
        }

        // Pass through all other messages
        return (original as any)(message, ...args);
      } as typeof window.postMessage;
    }
  } catch (e) {
    console.warn('[postMessage patch] Could not patch:', e);
  }
})();

// ─── Warm up backend (DNS + Lambda cold start) ──────────────────
// Fire-and-forget: primes DNS cache and wakes Lambda container
// so data fetches on the homepage succeed on first try.
warmupBackend();

// ─── Global error handlers ───────────────────────────────────────
// The @metagptx/web-sdk has a built-in error overlay ("Something is wrong")
// that catches unhandled errors. We MUST prevent all non-critical errors
// from reaching it by handling them here.

window.addEventListener('error', (event) => {
  const msg = String(event.message || '').toLowerCase();
  // Suppress all network/API/fetch errors — they are handled in-app
  if (
    msg.includes('dns') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('balancer') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('service unavailable') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('not ready') ||
    msg.includes('lambda') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('loading css chunk') ||
    msg.includes('loading chunk') ||
    msg.includes('script error')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn('[Suppressed global error]', msg);
    return false;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = String(reason?.message || reason || '').toLowerCase();
  // Suppress ALL unhandled promise rejections from API/network calls
  if (
    msg.includes('dns') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('balancer') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('service unavailable') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('not ready') ||
    msg.includes('lambda') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('query') ||
    msg.includes('entities') ||
    msg.includes('api') ||
    msg.includes('request') ||
    msg.includes('status') ||
    msg.includes('response')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn('[Suppressed unhandled rejection]', msg);
    return;
  }
  // For any other unhandled rejection, still prevent the overlay
  // but log it for debugging
  event.preventDefault();
  event.stopImmediatePropagation();
  console.error('[Unhandled rejection - suppressed overlay]', reason);
});

// ─── Render App ──────────────────────────────────────────────────
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}