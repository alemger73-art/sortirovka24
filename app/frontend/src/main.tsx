import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { warmupBackend } from './lib/api';
import { installProductionErrorHandlers } from './lib/errorHandlers';
import { initMonitoring } from './lib/monitoring';
import { initNativeShell } from './lib/native';
import { restoreAccountSession, scheduleNativeSessionHydration } from './lib/sessionStore';

// PWA registration is handled by vite-plugin-pwa (web builds only; disabled in --mode mobile).
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
    const targets: Array<{ obj: Window; original: typeof window.postMessage }> = [];
    const origSelf = window.postMessage.bind(window);
    targets.push({ obj: window, original: origSelf });

    try {
      if (window.top && window.top !== window) {
        const origTop = window.top.postMessage.bind(window.top);
        targets.push({ obj: window.top, original: origTop });
      }
    } catch {
      // Cross-origin — can't patch window.top
    }

    for (const { obj, original } of targets) {
      obj.postMessage = function patchedPostMessage(message: any, ...args: any[]) {
        if (
          message &&
          typeof message === 'object' &&
          message.type === 'mgx-appview-error' &&
          message.data
        ) {
          const errMsg = String(message.data.errMsg || '').toLowerCase();
          const stack = String(message.data.stack || '').toLowerCase();
          const combined = `${errMsg} ${stack}`;

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
            combined.includes('lambda')
          ) {
            console.warn('[Suppressed SDK error report]', errMsg);
            return;
          }
        }

        return (original as any)(message, ...args);
      } as typeof window.postMessage;
    }
  } catch (e) {
    console.warn('[postMessage patch] Could not patch:', e);
  }
})();

initMonitoring();
installProductionErrorHandlers();

warmupBackend();

function removeBootSplash(): void {
  document.getElementById('boot-splash')?.remove();
}

function bootApp() {
  restoreAccountSession();

  const rootElement = document.getElementById('root');
  if (rootElement) {
    try {
      createRoot(rootElement).render(<App />);
      removeBootSplash();
      initNativeShell();
      scheduleNativeSessionHydration();
    } catch (err) {
      console.error('[boot] render failed:', err);
      removeBootSplash();
      rootElement.innerHTML =
        '<div style="padding:24px;font-family:sans-serif;text-align:center">' +
        '<h2 style="color:#2563EB">Sortirovka24</h2>' +
        '<p>Не удалось запустить приложение. Удалите и установите APK заново.</p></div>';
    }
  }
}

bootApp();
