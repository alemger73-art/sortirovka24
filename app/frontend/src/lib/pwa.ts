export function pwaPlatform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
  const browser = /CriOS|Chrome/i.test(ua) && !/Edg|SamsungBrowser/i.test(ua) ? 'chrome'
    : /SamsungBrowser/i.test(ua) ? 'samsung' : /Edg/i.test(ua) ? 'edge'
    : /FxiOS|Firefox/i.test(ua) ? 'firefox' : /Safari/i.test(ua) ? 'safari' : 'other';
  return { platform, browser, ios, embedded: /Instagram|FBAN|FBAV|; wv\)|Telegram/i.test(ua) };
}
export function isPwaStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
export function safeInternalPath(path: unknown, fallback = '/cabinet?tab=notifications'): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || [...path].some(c => c.charCodeAt(0) <= 32)) return fallback;
  try { const url = new URL(path, window.location.origin); return url.origin === window.location.origin ? url.pathname + url.search + url.hash : fallback; }
  catch { return fallback; }
}
export function pwaEvent(event: string) {
  const { platform, browser } = pwaPlatform();
  const detail = { event, platform, browser, source: isPwaStandalone() ? 'pwa' : 'browser' };
  window.dispatchEvent(new CustomEvent('s24:pwa-analytics', { detail }));
  void fetch('/api/v1/push/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(detail), keepalive: true }).catch(() => {});
}
export type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let prompt: InstallEvent | null = null;
let initialized = false;
export const currentInstallPrompt = () => prompt;
export function takeInstallPrompt() { const event = prompt; prompt = null; return event; }
export function initPwaInstall() {
  if (initialized) return;
  initialized = true;
  if (isPwaStandalone()) { document.documentElement.classList.add('pwa-standalone'); pwaEvent('pwa_standalone_open'); }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); prompt = event as InstallEvent;
    window.dispatchEvent(new Event('s24:install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    prompt = null; pwaEvent('pwa_appinstalled'); window.dispatchEvent(new Event('s24:install-ready'));
  });
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'PUSH_CLICKED') pwaEvent('push_notification_clicked');
  });
  void navigator.serviceWorker?.ready.then(reg => reg.active?.postMessage({ type: 'PWA_CLIENT_READY' }));
}
