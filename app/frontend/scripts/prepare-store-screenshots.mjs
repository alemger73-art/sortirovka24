import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
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
let missing = 0;

for (const [srcName, playName, iosName] of map) {
  const src = join(source, srcName);
  if (!existsSync(src)) {
    console.warn(`missing source: ${srcName}`);
    missing++;
    continue;
  }
  copyFileSync(src, join(playDest, playName));
  copyFileSync(src, join(iosDest, iosName));
  copied++;
  console.log(`ok ${srcName}`);
}

console.log(`\nCopied ${copied} sets (${copied * 2} files). Missing sources: ${missing}.`);

writeFileSync(
  join(root, 'store-screenshots-report.txt'),
  `copied=${copied}\nmissing=${missing}\nplay=${playDest}\nios=${iosDest}\n`,
  'utf8',
);

if (missing > 0) process.exit(1);
