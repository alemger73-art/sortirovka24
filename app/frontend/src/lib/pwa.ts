export function pwaPlatform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
  const browser = /YaBrowser|YaSearchBrowser|YandexSearch/i.test(ua) ? 'yandex'
    : /OPR\/|OPT\/|Opera/i.test(ua) ? 'opera' : /MiuiBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser|UCBrowser/i.test(ua) ? 'vendor'
    : /CriOS|Chrome/i.test(ua) && !/Edg|SamsungBrowser/i.test(ua) ? 'chrome'
    : /SamsungBrowser/i.test(ua) ? 'samsung' : /Edg/i.test(ua) ? 'edge'
    : /FxiOS|Firefox/i.test(ua) ? 'firefox' : /Safari/i.test(ua) ? 'safari' : 'other';
  return { platform, browser, ios, embedded: /Instagram|FBAN|FBAV|; wv\)|Telegram/i.test(ua) };
}
/** Major version of the current browser (diagnostics only). */
export function browserVersion(): string | undefined {
  const ua = navigator.userAgent;
  for (const token of ['YaBrowser', 'OPR', 'SamsungBrowser', 'EdgA', 'Edg', 'Firefox', 'MiuiBrowser', 'HuaweiBrowser', 'CriOS', 'Chrome', 'Version']) {
    const m = ua.match(new RegExp(`${token}/(\\d{1,4})`));
    if (m) return m[1];
  }
  return undefined;
}
/** Android: only Chrome builds a real app (own icon, no badge, listed among apps) with one tap.
 *  Any other browser (Yandex, Opera, Xiaomi, Firefox, in-app windows) is sent to Chrome. */
export function needsChromeForInstall() {
  const env = pwaPlatform();
  return env.platform === 'android' && (env.embedded || env.browser !== 'chrome');
}
const INSTALL_PARAM = 's24install';
/** Opens this page in Chrome with an install sheet; without Chrome it comes back here with instructions. */
export function chromeIntentUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(INSTALL_PARAM, '1');
  const back = new URL(window.location.href);
  back.searchParams.set(INSTALL_PARAM, 'nochrome');
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(back.toString())};end`;
}
/** 'chrome' = arrived from another browser to install; 'nochrome' = Chrome is missing. Clears the mark. */
export function takeInstallLinkMark(): '1' | 'nochrome' | null {
  const url = new URL(window.location.href);
  const mark = url.searchParams.get(INSTALL_PARAM);
  if (mark !== '1' && mark !== 'nochrome') return null;
  url.searchParams.delete(INSTALL_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return mark;
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
  const { platform, browser, embedded } = pwaPlatform();
  const detail = { event, platform, browser, source: isPwaStandalone() ? 'pwa' : 'browser', embedded, prompt: !!currentInstallPrompt(), version: browserVersion() };
  window.dispatchEvent(new CustomEvent('s24:pwa-analytics', { detail }));
  void fetch('/api/v1/push/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(detail), keepalive: true }).catch(() => {});
}
export type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let prompt: InstallEvent | null = null;
let initialized = false;
type EarlyWindow = Window & { __s24InstallPrompt?: InstallEvent | null };
// The event may have arrived before this module loaded (caught by the inline script in index.html).
const early = () => (window as EarlyWindow).__s24InstallPrompt || null;
export const currentInstallPrompt = () => prompt || early();
export function takeInstallPrompt() { const event = prompt || early(); prompt = null; (window as EarlyWindow).__s24InstallPrompt = null; return event; }
export function initPwaInstall() {
  if (initialized) return;
  initialized = true;
  if (isPwaStandalone()) { document.documentElement.classList.add('pwa-standalone'); pwaEvent('pwa_standalone_open'); }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); prompt = event as InstallEvent;
  });
  window.addEventListener('appinstalled', () => {
    prompt = null; pwaEvent('pwa_appinstalled'); window.dispatchEvent(new Event('s24:install-ready'));
  });
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'PUSH_CLICKED') pwaEvent('push_notification_clicked');
  });
  void navigator.serviceWorker?.ready.then(reg => reg.active?.postMessage({ type: 'PWA_CLIENT_READY' }));
}
