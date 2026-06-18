import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Отдельное приложение админ-панели Sortirovka24.
 *
 * Работает в режиме live-server: WebView открывает живую админку,
 * размещённую на Railway (/admin). Это значит, что приложение всегда
 * показывает актуальную версию — при деплое сайта обновляется и админка
 * внутри установленного приложения, пересобирать APK не нужно.
 *
 * Чтобы поменять адрес сервера — измените ADMIN_URL ниже.
 */
const BACKEND_HOST = 'sortirovka24-production-8788.up.railway.app';
const ADMIN_URL = `https://${BACKEND_HOST}/admin`;

const config: CapacitorConfig = {
  appId: 'kz.sortirovka24.admin',
  appName: 'Sortirovka24 Админ',
  webDir: 'www',
  server: {
    url: ADMIN_URL,
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [BACKEND_HOST, '*.up.railway.app'],
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
