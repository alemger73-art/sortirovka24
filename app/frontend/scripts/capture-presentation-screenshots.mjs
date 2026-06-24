/**
 * Capture real Sortirovka24 UI for presentation PDF.
 * Run from app/frontend:
 *   node scripts/capture-presentation-screenshots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/presentation/screenshots');
const BASE = process.env.SCREENSHOT_BASE_URL || 'https://sortirovka24-production-8788.up.railway.app';

const shots = [
  { file: 'mobile-home.png', url: '/', viewport: { width: 390, height: 844 } },
  { file: 'mobile-food.png', url: '/food', viewport: { width: 390, height: 844 } },
  { file: 'mobile-food-menu.png', url: '/food/restaurants', viewport: { width: 390, height: 844 } },
  { file: 'mobile-gastronom.png', url: '/gastronom', viewport: { width: 390, height: 844 } },
  { file: 'mobile-pharmacy.png', url: '/apteka', viewport: { width: 390, height: 844 } },
  { file: 'mobile-prorab.png', url: '/prorab', viewport: { width: 390, height: 844 } },
  { file: 'mobile-business.png', url: '/business', viewport: { width: 390, height: 844 } },
  { file: 'mobile-taxi.png', url: '/taxi', viewport: { width: 390, height: 844 } },
  { file: 'mobile-announcements.png', url: '/announcements', viewport: { width: 390, height: 844 } },
  { file: 'mobile-masters.png', url: '/masters', viewport: { width: 390, height: 844 } },
  { file: 'mobile-account.png', url: '/account', viewport: { width: 390, height: 844 } },
  { file: 'mobile-more.png', url: '/more', viewport: { width: 390, height: 844 } },
  { file: 'tablet-home.png', url: '/', viewport: { width: 834, height: 1112 } },
  { file: 'tablet-gastronom.png', url: '/gastronom', viewport: { width: 834, height: 1112 } },
  { file: 'tablet-pharmacy.png', url: '/apteka', viewport: { width: 834, height: 1112 } },
  { file: 'tablet-announcements.png', url: '/announcements', viewport: { width: 834, height: 1112 } },
  { file: 'desktop-home.png', url: '/', viewport: { width: 1280, height: 800 } },
  { file: 'desktop-food.png', url: '/food', viewport: { width: 1280, height: 800 } },
  { file: 'desktop-gastronom.png', url: '/gastronom', viewport: { width: 1280, height: 800 } },
  { file: 'desktop-pharmacy.png', url: '/apteka', viewport: { width: 1280, height: 800 } },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});

console.log('Base URL:', BASE);
console.log('Output:', OUT);

for (const shot of shots) {
  const ctx = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: shot.viewport.width < 500 ? 2 : 1.5,
    locale: 'ru-RU',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${shot.url}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, shot.file) });
    console.log('OK', shot.file);
  } catch (e) {
    console.error('FAIL', shot.file, e.message);
  }
  await ctx.close();
}

await browser.close();
console.log('Done.');
