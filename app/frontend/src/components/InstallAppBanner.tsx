import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { isNativeApp } from '@/lib/native';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 's24_install_banner_dismissed';

export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isNativeApp()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-900 dark:bg-gray-900">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white">Установить Sortirovka24</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Добавьте на главный экран — быстрый доступ к новостям, еде и кабинету.
          </p>
          <button
            type="button"
            className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              await deferredPrompt.prompt();
              setVisible(false);
              setDeferredPrompt(null);
            }}
          >
            Установить
          </button>
        </div>
        <button
          type="button"
          aria-label="Закрыть"
          className="text-gray-400 hover:text-gray-600"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setVisible(false);
          }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
