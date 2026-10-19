import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isNativeApp } from '@/lib/native';
import { currentInstallPrompt, takeInstallPrompt, isPwaStandalone, pwaEvent, pwaPlatform, needsChromeForInstall, chromeIntentUrl } from '@/lib/pwa';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function InstallAppBanner({ manual = false }: { manual?: boolean }) {
  const [ready, setReady] = useState(0);
  const [help, setHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem('s24_install_dismissed_at')) < 7 * 86400000; } catch { return false; }
  });
  const [installed, setInstalled] = useState(isPwaStandalone);
  const [busy, setBusy] = useState(false);
  const environment = pwaPlatform();
  const viaChrome = needsChromeForInstall();
  const visible = !isNativeApp() && !installed && (manual || (!dismissed && (environment.ios || viaChrome || !!currentInstallPrompt())));
  useEffect(() => {
    const refresh = () => setReady(n => n + 1);
    const installedNow = () => setInstalled(true);
    window.addEventListener('s24:install-ready', refresh);
    window.addEventListener('appinstalled', installedNow);
    const mode = window.matchMedia('(display-mode: standalone)');
    mode.addEventListener('change', refresh);
    return () => { window.removeEventListener('s24:install-ready', refresh); window.removeEventListener('appinstalled', installedNow); mode.removeEventListener('change', refresh); };
  }, []);
  useEffect(() => { if (visible) pwaEvent('pwa_install_cta_shown'); }, [visible]);
  async function install() {
    if (busy) return;
    pwaEvent('pwa_install_cta_clicked');
    const prompt = takeInstallPrompt();
    if (!prompt) {
      // Android: the browser here cannot install (Yandex, in-app WhatsApp/Telegram tab…) — hand over to Chrome,
      // which shows its own one-tap «Установить». iPhone: Apple allows only the Share-sheet route.
      if (environment.platform === 'android') { pwaEvent('pwa_open_in_chrome'); window.location.href = chromeIntentUrl(); return; }
      setHelp(true); return;
    }
    setBusy(true);
    try {
      pwaEvent('pwa_install_prompt_shown'); await prompt.prompt();
      const result = await prompt.userChoice;
      pwaEvent(result.outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed');
      setHelp(result.outcome !== 'accepted');
    } catch { setHelp(true); }
    finally { setBusy(false); }
  }
  if (isPwaStandalone() || !visible) return null;
  return <>
    <div data-install-banner data-ready={ready} className={manual ? '' : 'fixed inset-x-0 z-[45] p-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-3'}>
      <div className="mx-auto flex max-w-lg gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-900 dark:bg-gray-900">
        <img src="/icon-192-v4.png" alt="" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1"><p className="font-semibold">Установить Сортировка 24</p>
          <p className="mt-1 text-sm text-gray-500">«Сортировка 24» появится на главном экране и будет открываться как приложение.</p>
          {viaChrome ? <>
            <p className="mt-1 text-sm text-gray-500">Установите через Chrome — тогда будет настоящее приложение со своей иконкой, без значка браузера.</p>
            <a href={chromeIntentUrl()} onClick={() => pwaEvent('pwa_open_in_chrome')} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white"><Download size={18} />Открыть в Chrome и установить</a>
          </> : <button disabled={busy} onClick={() => void install()} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white"><Download size={18} />{busy ? 'Открываем…' : 'Установить Сортировка 24'}</button>}
        </div>
        {!manual && <button aria-label="Закрыть предложение установки" className="self-start p-2" onClick={() => { try { localStorage.setItem('s24_install_dismissed_at', String(Date.now())); } catch { /* storage optional */ } setDismissed(true); }}><X size={20} /></button>}
      </div>
    </div>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="rounded-2xl bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
      <DialogTitle>Установить «Сортировка 24»</DialogTitle>
      {environment.ios ? <DialogDescription asChild><div className="space-y-4 text-base text-slate-700 dark:text-slate-200">
        <p className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950"><Share size={20} /></span>Нажмите «Поделиться» внизу экрана</p>
        <p className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-600 dark:bg-blue-950">+</span>Выберите «На экран „Домой“»</p>
        {environment.browser !== 'safari' && <p className="text-sm text-slate-500">Если пункта нет — откройте сайт в Safari.</p>}
      </div></DialogDescription>
      : <DialogDescription>Откройте меню браузера ⋮ и выберите «Установить приложение».</DialogDescription>}
    </DialogContent></Dialog>
  </>;
}
