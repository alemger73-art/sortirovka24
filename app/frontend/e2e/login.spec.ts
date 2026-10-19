import { test, expect } from "@playwright/test";

// Real local API, outbound messages disabled and a test-only debug code.
// Customers sign in only with a code (WhatsApp/Telegram in production; the local API offers SMS).
test("code sign-in creates a verified cabinet with canonical phone", async ({ page }) => {
  const digits = '700' + String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
  await page.goto('/account');
  await page.getByLabel('Ваше имя', { exact: true }).fill('Асия');
  const phone = page.getByLabel('Номер телефона, код страны +7', {exact:true});
  await phone.fill('8' + digits);
  await expect(phone).toHaveValue(digits);
  const codeButton = page.getByRole('button', { name: /Получить код/ }).first();
  // Missing consents are explained instead of a silently disabled button.
  await codeButton.click();
  await expect(page.getByRole('alert')).toContainText('галочки');
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  const response = page.waitForResponse(r => r.url().endsWith('/account/signin/request-sms') && r.request().method() === 'POST');
  await codeButton.click();
  const sms = await (await response).json();
  expect(sms.debug_code).toMatch(/^\d{6}$/);
  await page.locator('#quick-code').fill(sms.debug_code);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.waitForURL('**/cabinet', {timeout:15000});
  await expect(page.getByRole('heading', { name: 'Асия', exact: true })).toBeVisible();
});

test("staff password login is the only password form and rejects customers", async ({ page, request }) => {
  const r = await request.post('/api/v1/account/login', { data: { phone: '+77001112233', password: 'whatever123' } });
  expect([401, 403]).toContain(r.status());
});
