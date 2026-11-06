import { test, expect, type Page } from '@playwright/test';

/** A guest is offered the 300 registration bonuses first; «Позже» hands over to the install banner. */
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.1.123.00 SA/3 Mobile Safari/537.36'; // a browser whose install banner shows by itself;
test.use({ userAgent: UA, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function open(page: Page, path = '/') {
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', r => r.fulfill({ json: { items: [], total: 0 } }));
  await page.clock.install();
  await page.goto(path);
  await page.clock.fastForward(21_000); // the offer waits 20 s into the visit
}

test('a guest gets the bonus offer and lands on the sign-in page', async ({ page }) => {
  await open(page, '/?from=post');
  const card = page.getByTestId('welcome-bonus');
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card).toContainText('Вам 300 бонусов');
  await expect(page.locator('[data-install-banner]')).toHaveCount(0); // one offer at a time
  await card.getByRole('button', { name: 'Забрать 300 бонусов' }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2F%3Ffrom%3Dpost/);
});

test('«Позже» hides the offer for days and the install banner follows', async ({ page }) => {
  await open(page);
  await page.getByTestId('welcome-bonus').getByRole('button', { name: 'Позже' }).click({ timeout: 8000 });
  await expect(page.getByTestId('welcome-bonus')).toHaveCount(0);
  await expect(page.locator('[data-install-banner]')).toBeVisible();
  await page.reload();
  await page.clock.fastForward(21_000);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('welcome-bonus')).toHaveCount(0);
});

test('a signed-in visitor is not offered registration', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('account_token', 'x'));
  await open(page);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('welcome-bonus')).toHaveCount(0);
});
