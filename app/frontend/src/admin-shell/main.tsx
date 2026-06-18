import { createRoot } from 'react-dom/client';
import App from './App';
import '@/index.css';
import { warmupBackend } from '@/lib/api';
import { initNativeShell } from '@/lib/native';

function removeBootSplash(): void {
  document.getElementById('boot-splash')?.remove();
}

warmupBackend();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
  removeBootSplash();
  initNativeShell();
}
