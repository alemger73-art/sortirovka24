import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { WifiOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function OfflineBanner() {
  const { t } = useLanguage();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 bg-amber-600 px-4 py-2.5 text-sm font-medium text-white pt-[max(0.625rem,env(safe-area-inset-top))]">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      {t('app.offline')}
    </div>
  );
}
