import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/pwa.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
function platform(ua, touch = 0, standalone = false) {
  const ctx = { navigator: { userAgent: ua, maxTouchPoints: touch }, window: { location: { origin: 'https://www.sortirovka24.kz' }, matchMedia: () => ({ matches: standalone }) }, URL, Event };
  vm.createContext(ctx); vm.runInContext(code, ctx); return ctx;
}
test('iPad desktop mode and iOS Chrome are recognized', () => {
  assert.equal(platform('Macintosh Safari', 5).pwaPlatform().ios, true);
  assert.equal(platform('iPhone CriOS Safari').pwaPlatform().browser, 'chrome');
  assert.equal(platform('Android SamsungBrowser Chrome').pwaPlatform().browser, 'samsung');
  assert.equal(platform('Windows Edg Chrome').pwaPlatform().browser, 'edge');
});
test('launch mode is detected independently of storage', () => {
  const ctx = platform('iPhone Safari'); ctx.navigator.standalone = true;
  assert.equal(ctx.isPwaStandalone(), true);
  assert.equal(platform('Android Chrome', 0, true).isPwaStandalone(), true);
});
test('notification routes reject schemes, authority and backslash tricks', () => {
  const ctx = platform('Chrome');
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test', null]) assert.equal(ctx.safeInternalPath(path), '/cabinet?tab=notifications');
  assert.equal(ctx.safeInternalPath('/cabinet/orders/food/154'), '/cabinet/orders/food/154');
});
test('install prompt captured before UI mounts and consumed once', () => {
  const ctx = platform('Android Chrome'); const handlers = {};
  ctx.window.addEventListener = (name, fn) => handlers[name] = fn;
  ctx.window.dispatchEvent = () => {};
  ctx.document = { documentElement: { classList: { add() {} } } };
  ctx.initPwaInstall();
  const event = { preventDefault() {}, prompt() {} }; handlers.beforeinstallprompt(event);
  assert.equal(vm.runInContext('currentInstallPrompt()', ctx), event);
  assert.equal(ctx.takeInstallPrompt(), event); assert.equal(ctx.takeInstallPrompt(), null);
});

const pushSource = fs.readFileSync(new URL('../src/lib/pushNotifications.ts', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replaceAll('export ', '').replaceAll('import.meta.env', 'env');
const pushCode = ts.transpileModule(pushSource, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
function pushContext({ ios = false, installed = false, permission = 'default' } = {}) {
  let prompts = 0, registrations = 0; const events = [];
  const ctx = { Capacitor: { isNativePlatform: () => false }, env: {}, pwaPlatform: () => ({ ios }), isPwaStandalone: () => installed,
    pwaEvent: event => events.push(event), safeInternalPath: path => path, setTimeout, clearTimeout, atob, Uint8Array,
    Notification: { permission, requestPermission: async () => { prompts++; return permission; } },
    window: { isSecureContext: true, PushManager: {}, Notification: {} },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null } }) } },
    pushApiClient: { registerWeb: async () => { registrations++; } },
  };
  vm.createContext(ctx); vm.runInContext(pushCode, ctx);
  return { ctx, events, prompts: () => prompts, registrations: () => registrations };
}
test('iOS browser requires installation even when Notification API is absent', async () => {
  const s = pushContext({ ios: true }); delete s.ctx.window.Notification;
  assert.equal(await s.ctx.getPushPermissionState(), 'needs-install'); assert.equal(s.prompts(), 0);
});
test('denied permission is never requested repeatedly', async () => {
  const s = pushContext({ permission: 'denied' });
  assert.equal(await s.ctx.enablePushNotifications(), 'denied'); assert.equal(s.prompts(), 0);
});
test('checking permission never prompts on first visit', async () => {
  const s = pushContext(); assert.equal(await s.ctx.getPushPermissionState(), 'disabled'); assert.equal(s.prompts(), 0);
});
function worker() {
  const handlers = {}, notifications = [], opened = [], focused = [], posts = [];
  const client = { url: 'https://www.sortirovka24.kz/food', navigate: async url => focused.push(url), focus: async () => true, postMessage: msg => posts.push(msg) };
  const pending = new Map();
  const cache = { put: async (key,value) => pending.set(key,value), match: async key => pending.get(key), delete: async key => pending.delete(key) };
  const ctx = { URL, Response, caches: { match: async () => new Response('offline'), open: async () => cache }, fetch: async () => { throw new Error('offline'); }, self: {
    location: { origin: 'https://www.sortirovka24.kz' }, registration: { showNotification: async (title, data) => notifications.push({ title, ...data }) },
    addEventListener: (name, fn) => handlers[name] = fn,
    clients: { matchAll: async () => [client], openWindow: async url => { opened.push(url); return client; } },
  } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8'), ctx);
  return { handlers, notifications, opened, focused, posts, ctx };
}
test('SW displays real notification and focuses/navigates existing window', async () => {
  const w = worker(); let done;
  w.handlers.push({ data: { json: () => ({ title: 'Готово', data: { path: '/cabinet/orders/food/154' } }) }, waitUntil: p => done = p }); await done;
  assert.equal(w.notifications[0].data.path, '/cabinet/orders/food/154');
  w.handlers.notificationclick({ notification: { data: w.notifications[0].data, close() {} }, waitUntil: p => done = p }); await done;
  assert.deepEqual(w.focused, ['https://www.sortirovka24.kz/cabinet/orders/food/154']);
  w.handlers.message({ data: { type:'PWA_CLIENT_READY' }, source: { postMessage: msg => w.posts.push(msg) }, waitUntil: p => done = p }); await done;
  assert.equal(w.posts[0].type, 'PUSH_CLICKED');
});
test('closed window opens correct route and malicious path falls back internally', async () => {
  const w = worker(); w.ctx.self.clients.matchAll = async () => []; let done;
  w.handlers.notificationclick({ notification: { data: { path: '/\\evil.test' }, close() {} }, waitUntil: p => done = p }); await done;
  assert.deepEqual(w.opened, ['https://www.sortirovka24.kz/cabinet?tab=notifications']);
});
test('API requests are untouched; offline navigation has explicit fallback; HTTP 404 preserved', async () => {
  const w = worker(); let response;
  w.handlers.fetch({ request: { mode: 'cors', url: 'https://www.sortirovka24.kz/api/orders' }, respondWith: p => response = p });
  assert.equal(response, undefined);
  w.handlers.fetch({ request: { mode: 'navigate', url: 'https://www.sortirovka24.kz/food' }, respondWith: p => response = p });
  assert.equal(await (await response).text(), 'offline');
  w.ctx.fetch = async () => new Response('missing', { status: 404 });
  w.handlers.fetch({ request: { mode: 'navigate', url: 'https://www.sortirovka24.kz/missing' }, respondWith: p => response = p });
  assert.equal((await response).status, 404);
});
