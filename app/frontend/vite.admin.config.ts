import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { viteSourceLocator } from '@metagptx/vite-plugin-source-locator';
import { atoms } from '@metagptx/web-sdk/plugins';

const root = __dirname;

export default defineConfig(({ mode }) => ({
  plugins: [
    viteSourceLocator({ prefix: 'mgx' }),
    react(),
    atoms(),
  ],
  root,
  publicDir: path.resolve(root, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  define: {
    'import.meta.env.VITE_APP_TITLE': JSON.stringify('Sortirovka24 Админ'),
    'import.meta.env.VITE_APP_DESCRIPTION': JSON.stringify('Панель управления Sortirovka24'),
  },
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
    },
    rollupOptions: {
      input: path.resolve(root, 'admin.html'),
    },
  },
  server: {
    port: 3100,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || '8000'}`,
        changeOrigin: true,
      },
    },
  },
}));
