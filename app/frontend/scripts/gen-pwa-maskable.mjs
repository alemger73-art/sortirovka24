// Build Android safe-zone assets from the existing brand artwork; no new logo.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/icon-512-v2.png', import.meta.url));
for (const size of [192, 512]) {
  // Entire source square fits inside the mandatory radius 40% safe circle.
  const inner = Math.floor(size * .56);
  const art = await sharp(source).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#F8FAFC' } })
    .composite([{ input: art, gravity: 'centre' }]).png()
    .toFile(new URL(`../public/icon-maskable-${size}-v3.png`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
}
