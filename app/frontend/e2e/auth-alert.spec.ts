import { test, expect } from '@playwright/test';

/** A sign-up refused because of the site (here: a document edition the server does not know) reaches the
 *  owner as a site error; a person's own mistake (wrong code, too many tries) does not. */
async function signUp(page: import('@playwright/test').Page, status: number, detail: string) {
  const reports: { message: string }[] = [];
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/error')) { reports.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); }
    if (path.includes('/signin/request')) return r.fulfill({ status, json: { detail } });
    if (path.endsWith('/otp-channels')) return r.fulfill({ json: { channels: ['whatsapp'] } });
    if (path.endsWith('/modules')) return r.fulfill({ json: { food: true } });
    return r.fulfill({ status: 404, json: {} });
  });
  await page.goto('/account');
  await page.getByLabel('Ваше имя', { exact: true }).fill('Асылбек');
  await page.getByLabel('Номер телефона, код страны +7', { exact: true }).fill('7085032831');
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: /WhatsApp/ }).first().click();
  await expect(page.getByRole('alert')).toContainText(detail.slice(0, 20));
  return reports;
}

test('a sign-up blocked by the site is reported to the owner', async ({ page }) => {
  const reports = await signUp(page, 409, 'Юридические документы обновлены. Обновите страницу.');
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0].message).toContain('Регистрация/вход не прошли на шаге «код» (HTTP 409)');
});

test('too many tries is the person’s own limit and is not reported', async ({ page }) => {
  const reports = await signUp(page, 429, 'Слишком много попыток. Попробуйте позже.');
  await page.waitForTimeout(800);
  expect(reports).toHaveLength(0);
});
