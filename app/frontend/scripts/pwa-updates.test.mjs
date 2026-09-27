import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/pwaUpdates.ts', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace('export function', 'function').replaceAll('import.meta.env', 'env');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
function setup({ native = false, waiting = true, controlled = true } = {}) {
  const events = () => ({ handlers: {}, addEventListener(name, fn) { (this.handlers[name] ??= []).push(fn); }, emit(name) { for (const fn of this.handlers[name] || []) fn(); } });
  let reloads = 0, updates = 0;
  const calls = [], notices = [], messages = [];
  const reg = { ...events(), waiting: waiting ? { postMessage: m => messages.push(m.type) } : null, update: async () => { updates++; } };
  const sw = { ...events(), controller: controlled ? {} : null, register: async (...args) => { calls.push(args); return reg; } };
  const window = { ...events(), location: { reload: () => reloads++ }, setInterval: () => 1 };
  const document = { ...events(), visibilityState: 'visible' };
  const navigator = { serviceWorker: sw, onLine: true };
  const context = { env: { PROD: true, MODE: 'production', VITE_APP_BUILD_ID: 'release-b' }, Capacitor: { isNativePlatform: () => native }, toast: (...args) => notices.push(args), getPublicLanguage: () => 'ru', window, document, navigator, console };
  vm.createContext(context); vm.runInContext(code + '\ninitWebAppUpdates();', context);
  return { context, reg, sw, document, navigator, window, calls, notices, messages, reloads: () => reloads, updates: () => updates };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('release URL bypasses stale CDN key while preserving registration scope', async () => {
  const s = setup(); await flush();
  assert.equal(s.calls[0][0], '/sw.js?v=release-b');
  assert.equal(s.calls[0][1].scope, '/');
  assert.equal(s.calls[0][1].updateViaCache, 'none');
  assert.ok(s.notices.length > 0);
  assert.equal(s.notices[0][1].id, 'app-update');
  assert.equal(s.reloads(), 0);
  s.notices[0][1].action.onClick();
  assert.deepEqual(s.messages, ['SKIP_WAITING']);
  s.sw.emit('controllerchange'); s.sw.emit('controllerchange');
  assert.equal(s.reloads(), 1);
});
test('first installation does not reload or offer an update', async () => {
  const s = setup({waiting:false, controlled:false}); await flush(); s.sw.emit('controllerchange');
  assert.equal(s.notices.length,0); assert.equal(s.reloads(),0);
});
test('offline and background do not update; reconnect retries rejected request', async () => {
  const s=setup({waiting:false}); await flush();
  const count=s.updates();
  s.navigator.onLine=false; s.window.emit('online'); await flush(); assert.equal(s.updates(),count);
  s.navigator.onLine=true; s.document.visibilityState='hidden'; s.window.emit('online'); await flush(); assert.equal(s.updates(),count);
  s.reg.update=async()=>{throw new Error('offline');}; s.document.visibilityState='visible'; s.window.emit('online'); await flush();
  let retried=0; s.reg.update=async()=>{retried++;}; s.window.emit('online'); await flush(); assert.equal(retried,1);
});
test('update installed in background offers action; no forced reload of a form', async () => {
  const s=setup({waiting:false}); await flush();
  s.reg.installing={handlers:{},addEventListener(n,fn){this.handlers[n]=fn;}};
  s.reg.emit('updatefound'); s.reg.waiting={postMessage:()=>{}}; s.reg.installing.handlers.statechange();
  assert.equal(s.notices.length,1); assert.equal(s.reloads(),0);
});
test('native APK does not register a browser service worker', async () => {
  const s=setup({native:true}); await flush(); assert.equal(s.calls.length,0);
});
