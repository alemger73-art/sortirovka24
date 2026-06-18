import { createRoot } from 'react-dom/client';
import App from './App';
import '@/index.css';
import { warmupBackend } from '@/lib/api';
import { initNativeShell } from '@/lib/native';
import { ensureBucket } from '@/lib/storage';

function removeBootSplash(): void {
  document.getElementById('boot-splash')?.remove();
}

warmupBackend();
void ensureBucket();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
  removeBootSplash();
  initNativeShell();
}
