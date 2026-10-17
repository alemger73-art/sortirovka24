// Against a local preview only. Every API/provider is mocked; no real SMS/OAuth/orders.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { documents, operator } from '../src/content/legal-data.mjs';
const origin = process.argv[2] || 'http://127.0.0.1:4189';
if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Local preview required');
const out = fileURLToPath(new URL('../../../output/legal-review-20261009/', import.meta.url));
await mkdir(out, { recursive:true });
const browser = await chromium.launch({ headless:true, ...(process.env.LEGAL_BROWSER_EXECUTABLE ? { executablePath:process.env.LEGAL_BROWSER_EXECUTABLE } : {}) });
const results = [];
try {
  for (const width of [390, 1440]) {
    for (const language of ['ru','kz']) {
      const context = await browser.newContext({ viewport:{ width, height:900 } });
      const smsRequests = [];
      await context.addInitScript(lang => localStorage.setItem('app_lang', lang), language);
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/api/')) {
          if (url.pathname.endsWith('/signin/request-sms')) {
            smsRequests.push(route.request().postDataJSON());
            return route.fulfill({ json:{ success:true, ttl_seconds:600, resend_after_seconds:60 } });
          }
          const payload = url.pathname.endsWith('/google/status') ? { enabled:true } : url.pathname.endsWith('/analytics/config') ? { enabled:false } : { promo_enabled:false, modules:[], enabled:false };
          return route.fulfill({ json:payload });
        }
        if (url.origin !== origin) return route.fulfill({ status:404, body:'' });
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      for (const [key, doc] of Object.entries(documents[language])) {
        await page.goto(`${origin}/legal/${key}`);
        await page.getByRole('heading', { name:doc.title, exact:true }).waitFor();
        if (!await page.getByText(operator.iin, { exact:false }).count()) throw new Error('Missing operator IIN');
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) throw new Error('Horizontal overflow');
        results.push({ width, language, key, sections:await page.locator('main section').count(), errors:[...errors] });
        if (width === 390 && key === 'food-terms') await page.screenshot({ path:`${out}/food-terms-${language}.png`, fullPage:true });
      }
      await page.goto(`${origin}/register`);
      await page.locator('#legal-subject-name').waitFor();
      const checkboxes = page.getByRole('checkbox');
      if (await checkboxes.count() !== 2 || await checkboxes.nth(0).isChecked() || await checkboxes.nth(1).isChecked()) throw new Error('Consent must have two non-preselected choices');
      await page.locator('#legal-subject-name').fill(language === 'ru' ? 'Тест Тестов' : 'Тест Тестов');
      const googleButton = page.getByRole('button', { name:/Google арқылы жалғастыру|Продолжить с Google/ });
      if (await googleButton.isEnabled()) throw new Error('Google must await both consents');
      await checkboxes.nth(0).check();
      if (await googleButton.isEnabled()) throw new Error('Data consent is independently required');
      await checkboxes.nth(1).check();
      if (!await googleButton.isEnabled()) throw new Error('Confirmed consent should allow Google start');
      if (width === 390) await page.screenshot({ path:`${out}/registration-${language}.png`, fullPage:true });
      await page.getByRole('button', { name:/Продолжить по телефону|Телефон арқылы жалғастыру/ }).click();
      await page.locator('#quick-phone').fill('7001234567');
      await page.getByRole('button', { name:/Получить SMS-код|SMS кодын алу/ }).click();
      await page.locator('#quick-code').waitFor();
      const request = smsRequests.at(-1);
      if (!request?.privacy_accepted || !request?.agreement_accepted || !request?.legal_version || request?.legal_subject_name !== 'Тест Тестов') throw new Error('SMS must receive active versioned consent');
      await page.goto(`${origin}/support`);
      await page.getByText(operator.email, { exact:true }).first().waitFor();
      if (await page.getByText(/KZ000|000000000000|Kaspi Bank/).count()) throw new Error('Transfer placeholders remain public');
      if (errors.length) throw new Error(errors.join('\n'));
      results.push({ width, language, separateConsents:true, transferDetailsHidden:true, smsConsentBeforeTransfer:true });
      await context.close();
    }
  }
  for (const language of ['ru','kz']) {
    const page = await browser.newPage();
    for (const [key, doc] of Object.entries(documents[language])) {
      await page.goto(`${origin}/${key}${language === 'kz' ? '-kz' : ''}.html`);
      await page.getByRole('heading', { name:doc.title, exact:true }).waitFor();
      results.push({ staticPage:key, language, loaded:true });
    }
    await page.close();
  }
  await writeFile(`${out}/browser-verification.json`, JSON.stringify(results,null,2));
  console.log(`Verified ${results.length} local legal, registration and contact cases.`);
} finally { await browser.close(); }
