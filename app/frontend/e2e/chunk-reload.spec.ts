import { test, expect } from '@playwright/test';

// After a release the old page parts are gone from the server. A tap that needs one must not end on an
// error screen: the page reloads once by itself and opens the section.
test('a missing page part after a release reloads once and opens the section', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/modules')) return route.fulfill({ json: { news: true, announcements: true } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  let failed = 0;
  await page.route(/\/assets\/Announcements-[^/]+\.js$/, (route) => {
    if (failed === 0) { failed++; return route.fulfill({ status: 404, body: 'gone' }); }
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('a[href="/announcements"]:visible').first().click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15000 });
  expect(failed).toBe(1);
  await expect(page.getByText(/Что-то пошло не так|Бет жүктелмеді/)).toHaveCount(0);
});

// Error #6 (31.10.2026, /announcements): when Vite's 'vite:preloadError' is cancelled to reload the page, the
// dynamic import resolves to an empty module and `m.AdsList` threw «Cannot read properties of undefined»,
// so the visitor saw the error screen while the page was about to reload. It must wait quietly instead.
test('an empty module during the release reload does not show the error screen', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); });
  await page.route('**/api/**', (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(async () => {
    const m = await import('/src/lib/lazyRetry.ts');
    window.fetch = () => new Promise<Response>(() => { /* keep the reload waiting while we look */ });
    sessionStorage.removeItem('s24_chunk_reload_at');
    m.installChunkReload();
    const ev = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(ev);
    // What Vite returns after a cancelled preload error: an undefined module.
    const load = m.withChunkReload(() => Promise.resolve(undefined as any).then((mod: any) => ({ default: mod.AdsList })));
    const outcome = await Promise.race([
      load().then(() => 'loaded', (e: Error) => 'error: ' + e.message),
      new Promise((r) => setTimeout(() => r('waiting'), 500)),
    ]);
    return { prevented: ev.defaultPrevented, outcome };
  });
  expect(result).toEqual({ prevented: true, outcome: 'waiting' });
});

// Error #7 (02.11.2026, /cabinet, Safari iOS): a page loaded as `() => import('./pages/Cabinet')` gets an
// undefined module (no rejection) after the cancelled preload error, and React's lazy failed with
// «undefined is not an object (evaluating 'e._result.default')». It must wait for the reload instead.
test('an undefined module from a plain page import waits for the reload', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); });
  await page.route('**/api/**', (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(async () => {
    const m = await import('/src/lib/lazyRetry.ts');
    window.fetch = () => new Promise<Response>(() => { /* keep the reload waiting while we look */ });
    sessionStorage.removeItem('s24_chunk_reload_at');
    m.installChunkReload();
    const ev = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(ev);
    // What a plain `import()` returns after a cancelled preload error: undefined itself.
    const load = m.withChunkReload(() => Promise.resolve(undefined as any));
    const outcome = await Promise.race([
      load().then((mod: any) => (mod == null ? 'empty module' : 'loaded'), (e: Error) => 'error: ' + e.message),
      new Promise((r) => setTimeout(() => r('waiting'), 500)),
    ]);
    return { prevented: ev.defaultPrevented, outcome };
  });
  expect(result).toEqual({ prevented: true, outcome: 'waiting' });
});
