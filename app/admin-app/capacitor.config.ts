import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Отдельное приложение админ-панели Sortirovka24.
 * UI встроен в APK (собирается из app/frontend/dist-admin).
 */
const config: CapacitorConfig = {
  appId: 'kz.sortirovka24.admin',
  appName: 'Sortirovka24 Админ',
  webDir: '../frontend/dist-admin',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'sortirovka24-production-8788.up.railway.app',
      '*.up.railway.app',
    ],
  },
  plugins: {
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
