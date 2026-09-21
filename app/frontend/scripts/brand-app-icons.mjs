// Resize the owner's original artwork without redrawing it.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'assets/brand-logo.jpg');
async function icon(path, size) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  await sharp(source).resize(size, size).png().toFile(resolve(root, path));
}
for (const [density, size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})) {
  for (const name of ['ic_launcher','ic_launcher_round']) await icon(`android/app/src/main/res/mipmap-${density}/${name}.png`, size);
}
await icon('android/app/src/main/res/drawable/brand_launcher.png', 864);
// Keep the complete logo inside the safe area of adaptive masks.
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@android:color/white"/>
  <foreground><inset android:drawable="@drawable/brand_launcher" android:inset="20%"/></foreground>
</adaptive-icon>
`;
for (const name of ['ic_launcher','ic_launcher_round']) writeFileSync(resolve(root,`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`),adaptive);
await icon('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',1024);
await icon('play-store/icon-512.png',512);
console.log('Owner artwork applied to Android, iOS and store icons.');
