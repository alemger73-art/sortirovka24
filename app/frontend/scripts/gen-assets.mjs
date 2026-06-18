// Rasterizes brand SVGs into the PNG sources required by Capacitor assets
// and the PWA. Run: node scripts/gen-assets.mjs
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconSvg = readFileSync(resolve(root, 'assets/icon.svg'));
const splashSvg = readFileSync(resolve(root, 'assets/splash.svg'));

mkdirSync(resolve(root, 'assets'), { recursive: true });
mkdirSync(resolve(root, 'public'), { recursive: true });

const jobs = [
  // Capacitor source assets (capacitor-assets reads these)
  { svg: iconSvg, size: 1024, out: 'assets/icon.png' },
  { svg: splashSvg, size: 2732, out: 'assets/splash.png' },
  { svg: splashSvg, size: 2732, out: 'assets/splash-dark.png' },
  // PWA / web icons (manifest + apple-touch + boot splash)
  { svg: iconSvg, size: 512, out: 'public/icon-512.png' },
  { svg: iconSvg, size: 192, out: 'public/icon-192.png' },
  { svg: iconSvg, size: 180, out: 'public/apple-touch-icon.png' },
];

for (const { svg, size, out } of jobs) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(resolve(root, out));
  console.log(`generated ${out} (${size}x${size})`);
}
