import { test, expect } from '@playwright/test';

// Ошибка №14: после выкладки посетитель со старой открытой страницей открывает объявление, часть страницы
// не загружается, и вместо тихой перезагрузки появлялся экран ошибки
// («undefined is not an object (evaluating 'e.AdDetail')»). Страница должна сама перезагрузиться и открыть объявление.
test('a missing page part on an announcement page reloads once instead of the error screen', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1');
    // Запоминаем, если экран ошибки хоть на миг появился (переживает перезагрузку страницы).
    new MutationObserver(() => {
      if (/Что-то пошло не так|Бет жүктелмеді/.test(document.body?.innerText || '')) sessionStorage.setItem('t_err_screen', '1');
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/modules')) return route.fulfill({ json: { news: true, announcements: true } });
    if (/\/announcements\/15$/.test(path)) return route.fulfill({ json: { id: 15, title: 'Тестовое объявление', description: 'текст', price: 1000, category: 'other', images: [], created_at: '2026-11-06T10:00:00Z', status: 'active' } });
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
  await page.evaluate(() => { history.pushState({}, '', '/announcements/15'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page).toHaveURL(/\/announcements\/15$/);
  await page.waitForLoadState('load');
  await page.waitForTimeout(4000);
  expect(failed).toBe(1);
  await expect(page.getByText(/Что-то пошло не так|Бет жүктелмеді/)).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('t_err_screen'))).toBeNull();
  expect(errors.filter((m) => /AdDetail/.test(m))).toEqual([]);
});
