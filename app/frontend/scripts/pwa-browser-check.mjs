import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dist = path.resolve('dist');
const evidence = path.resolve('../../output/pwa-evidence-2026-10-02');
await fs.mkdir(evidence, { recursive: true });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(url.pathname.endsWith('diagnostics-access') ? { allowed: true } : url.pathname.endsWith('modules') ? {} : [])); return; }
  let file = path.join(dist, url.pathname);
  try { if (!(await fs.stat(file)).isFile()) throw new Error(); } catch { file = path.join(dist, 'index.html'); }
  const ext = path.extname(file); res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.json': 'application/manifest+json' })[ext] || 'application/octet-stream');
  res.end(await fs.readFile(file));
});
await new Promise(resolve => server.listen(5191, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  // Chrome blocks installation in incognito contexts; use an isolated persistent
  // test profile, never the user's browser profile, for installability diagnostics.
  const profile = await fs.mkdtemp(path.resolve('../../.cache/pwa-chrome-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true }); const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5191/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page); await cdp.send('Page.enable');
  const manifest = await cdp.send('Page.getAppManifest'); assert.equal(manifest.errors.length, 0);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  results.push({ test: 'manifest browser parse', passed: true, installability });
  await page.goto('http://127.0.0.1:5191/more');
  await page.getByRole('button', { name: 'Установить Sortirovka 24', exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(evidence, 'android-install.png'), fullPage: true });
  await context.setOffline(true); await page.reload(); await page.getByRole('heading', { name: 'Нет подключения' }).waitFor();
  await page.screenshot({ path: path.join(evidence, 'offline.png') });
  await context.setOffline(false); // offline document reloads automatically on the online event
  await page.getByRole('button', { name: 'Установить Sortirovka 24', exact: true }).first().waitFor();
  results.push({ test: 'real SW offline navigation and reconnect', passed: true });
  // Verify no protected responses are stored by the service worker.
  const cached = await page.evaluate(async () => { const keys = []; for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) keys.push(req.url); return keys; });
  assert.ok(!cached.some(url => new URL(url).pathname.startsWith('/api/')));
  assert.ok(!cached.some(url => new URL(url).pathname === '/index.html'));
  results.push({ test: 'API and HTML excluded from caches', passed: true });
  await page.goto('http://127.0.0.1:5191/cabinet/orders/food/154');
  await page.waitForURL('**/account?redirect=*');
  assert.equal(new URL(page.url()).searchParams.get('redirect'), '/cabinet/orders/food/154');
  results.push({ test: 'push order deep link preserved through login redirect', passed: true });
  await context.addInitScript(() => localStorage.setItem('_sp924_token', 'isolated-ui-test-token'));
  await page.goto('http://127.0.0.1:5191/admin/pwa-diagnostics');
  await page.getByRole('button', { name: 'Run PWA diagnostics' }).click();
  await page.getByText('s24-pwa-20261002', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidence, 'diagnostics.png'), fullPage: true });
  results.push({ test: 'diagnostics UI and live SW version (API access mocked)', passed: true });
  await context.close();
  for (const [name, ua] of [['safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1'], ['chrome-ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 CriOS/138.0 Mobile/15E148 Safari/604.1']]) {
    const c = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await c.newPage();
    await p.goto('http://127.0.0.1:5191/more');
    await p.getByRole('button', { name: 'Установить Sortirovka 24', exact: true }).first().click();
    await p.getByRole('dialog').waitFor();
    assert.ok((await p.getByRole('dialog').innerText()).includes('Открывать как веб-приложение'));
    await p.screenshot({ path: path.join(evidence, `${name}-assistant.png`), animations: 'disabled' });
    results.push({ test: `${name} instructions (UA emulation, not real iOS installation)`, passed: true }); await c.close();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await fs.writeFile(path.join(evidence, 'browser.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); server.close(); }
