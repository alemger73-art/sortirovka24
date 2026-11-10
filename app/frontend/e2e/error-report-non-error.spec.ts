import { test, expect } from '@playwright/test';

// Ошибка №21: на странице объявления (iPhone, Safari) в журнал пришло только «Error: {}» — что-то в фоне
// отклонилось не настоящей ошибкой, а объектом (например, ответом сервера Response), и JSON.stringify
// превратил его в «{}». По такой записи нельзя найти причину. Теперь в журнал попадает вид объекта и его поля.
test('a rejection with a non-Error object is reported with its kind and fields, not as "{}"', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); });
  const reports: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/site-analytics/error')) { reports.push(JSON.parse(route.request().postData() || '{}').message || ''); return route.fulfill({ json: { ok: true } }); }
    if (path.endsWith('/modules')) return route.fulfill({ json: { news: true, announcements: true } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    void Promise.reject(new Response('nope', { status: 503, statusText: 'Service Unavailable' }));
    void Promise.reject({});
  });
  await expect.poll(() => reports.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  expect(reports).not.toContain('Error: {}');
  expect(reports.some((m) => /Response .*status=503/.test(m))).toBe(true);
  expect(reports.some((m) => /объект без полей/.test(m))).toBe(true);
});
