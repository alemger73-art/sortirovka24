import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isNativeApp } from '@/lib/native';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 's24_install_banner_dismissed';
const INSTALLED_KEY = 's24_install_confirmed';

export default function InstallAppBanner() {
  const { t: publicT } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosInstructions, setIosInstructions] = useState(false);

  useEffect(() => {
    if (isNativeApp()) return;
    if (localStorage.getItem(INSTALLED_KEY) === '1') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) {
      localStorage.setItem(INSTALLED_KEY, '1');
      return;
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      setIosInstructions(true);
      setVisible(true);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, '1');
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible || (!deferredPrompt && !iosInstructions)) return null;

  return (
    <div
      className="fixed inset-x-0 z-[45] p-3 max-md:bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-install-banner
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-900 dark:bg-gray-900">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white">Установить Sortirovka 24</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {iosInstructions
              ? 'Нажмите «Поделиться», затем «На экран Домой». После установки сайт откроется как приложение.'
              : publicT("public.InstallAppBanner.text335")}
          </p>
          {deferredPrompt ? <button
            type="button"
            className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              await deferredPrompt.prompt();
              const choice = await deferredPrompt.userChoice;
              if (choice.outcome === 'accepted') localStorage.setItem(INSTALLED_KEY, '1');
              setVisible(false);
              setDeferredPrompt(null);
            }}
          >
            {publicT("public.InstallAppBanner.text336")}
          </button> : (
            <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
              <Share className="h-4 w-4" /> Поделиться → На экран Домой
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={publicT("common.close")}
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
