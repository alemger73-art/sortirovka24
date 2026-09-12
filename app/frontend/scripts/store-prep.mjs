/**
 * Store release prep: bundled .env.mobile + copy screenshots + validate keystore.
 * Run: node scripts/store-prep.mjs
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');

// build-store-web.mjs validates configuration without changing .env.mobile.

// Screenshots
const source = join(repoRoot, 'docs', 'presentation', 'screenshots');
const playDest = join(root, 'play-store', 'screenshots');
const iosDest = join(root, 'app-store', 'screenshots');
const map = [
  ['mobile-home.png', '01-home.png', '01-home.png'],
  ['mobile-food.png', '02-food.png', '02-food.png'],
  ['mobile-taxi.png', '03-taxi.png', '03-taxi.png'],
  ['mobile-announcements.png', '04-announcements.png', '04-announcements.png'],
  ['mobile-more.png', '05-more.png', '05-cabinet.png'],
  ['mobile-account.png', '06-account.png', '06-cabinet-alt.png'],
  ['mobile-masters.png', '07-masters.png', '07-masters.png'],
  ['mobile-food-menu.png', '08-food-menu.png', '08-food-menu.png'],
];

mkdirSync(playDest, { recursive: true });
mkdirSync(iosDest, { recursive: true });
let copied = 0;
for (const [srcName, playName, iosName] of map) {
  const src = join(source, srcName);
  if (!existsSync(src)) continue;
  copyFileSync(src, join(playDest, playName));
  copyFileSync(src, join(iosDest, iosName));
  copied++;
}
console.log(`screenshots: ${copied} sets → play-store/screenshots/, app-store/screenshots/`);

// Keystore
const jks = join(root, 'android', 'sortirovka24-release.jks');
const props = join(root, 'android', 'keystore.properties');
if (existsSync(jks) && existsSync(props)) {
  console.log('keystore: OK');
} else {
  console.warn('keystore: MISSING — run npm run setup:play-keystore');
  process.exitCode = 1;
}

writeFileSync(
  join(root, 'store-prep-done.txt'),
  `at=${new Date().toISOString()}\ncopied=${copied}\n`,
  'utf8',
);
