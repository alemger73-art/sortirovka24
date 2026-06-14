import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/** Read .env.mobile so `cap sync` picks up CAPACITOR_SERVER_URL without extra tooling. */
function loadMobileEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '.env.mobile');
  if (!existsSync(envPath)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

const mobileEnv = loadMobileEnv();

/**
 * Live-update mode: WebView opens the production site instead of bundled files.
 * Deploy frontend to Railway → all installed apps get updates on next launch.
 * Set CAPACITOR_SERVER_URL in .env.mobile (or leave empty for offline bundled mode).
 */
const liveServerUrl = (
  process.env.CAPACITOR_SERVER_URL ||
  mobileEnv.CAPACITOR_SERVER_URL ||
  mobileEnv.VITE_API_BASE_URL ||
  ''
).replace(/\/+$/, '');

const config: CapacitorConfig = {
  appId: 'kz.sortirovka24.app',
  appName: 'Sortirovka24',
  webDir: 'dist',
  server: liveServerUrl
    ? {
        url: liveServerUrl,
        androidScheme: 'https',
        cleartext: false,
      }
    : {
        androidScheme: 'https',
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#2563EB',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0B0F19',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
