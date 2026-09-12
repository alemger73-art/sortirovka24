import { loadEnv } from 'vite';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
if (!['android', 'ios'].includes(platform)) throw new Error('Usage: node scripts/build-store-web.mjs android|ios');
const vars = loadEnv('mobile', root, 'VITE_');
const api = process.env.API_BASE_URL || process.env.VITE_API_BASE_URL || vars.VITE_API_BASE_URL;
let url;
try { url = new URL(api); } catch { throw new Error('Configure an absolute HTTPS VITE_API_BASE_URL in .env.mobile'); }
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || /^(localhost|127\.|\[?::1)/i.test(url.hostname)) {
  throw new Error('Store API URL must be a public HTTPS origin without credentials, path or query.');
}
// VITE_* values are public. Fail on common accidental server secret names.
for (const key of Object.keys({ ...vars, ...process.env })) {
  if (/^VITE_.*(PRIVATE_KEY|SECRET|PASSWORD|SERVICE_ACCOUNT|BOT_TOKEN|ADMIN_TOKEN)/i.test(key)) {
    throw new Error(`Remove server-only secret ${key} from frontend environment.`);
  }
}
if ((process.env.VITE_ENABLE_NATIVE_PUSH || vars.VITE_ENABLE_NATIVE_PUSH) === 'true') {
  if (platform === 'android' && !existsSync(resolve(root, 'android/app/google-services.json'))) throw new Error('Native push requires android/app/google-services.json');
  if (platform === 'ios' && !existsSync(resolve(root, 'ios/App/App/App.entitlements'))) throw new Error('Configure iOS push entitlement and APNs backend before enabling native push.');
}
const env = { ...process.env, ...vars, VITE_API_BASE_URL: url.origin, CAPACITOR_BUILD_MODE: 'store', CAPACITOR_SERVER_URL: '' };
function run(script, args) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed (${result.status})`);
}
run('node_modules/typescript/bin/tsc', ['-b']);
run('node_modules/vite/bin/vite.js', ['build', '--mode', 'mobile']);
// Sync native plugin declarations; Capacitor skips CocoaPods when unavailable.
run('node_modules/@capacitor/cli/bin/capacitor', ['sync', platform]);
const configPath = platform === 'android' ? 'android/app/src/main/assets/capacitor.config.json' : 'ios/App/App/capacitor.config.json';
const config = JSON.parse(readFileSync(resolve(root, configPath), 'utf8'));
if (config.server?.url) throw new Error('Store build must use bundled assets, not a remote WebView URL.');
writeFileSync(resolve(root, 'dist/mobile-build.json'), JSON.stringify({ platform, apiOrigin: url.origin, bundled: true, builtAt: new Date().toISOString() }, null, 2));
console.log(`Store assets ready: ${platform}, bundled UI, API ${url.origin}`);
