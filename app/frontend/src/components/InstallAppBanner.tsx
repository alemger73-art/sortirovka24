import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isNativeApp } from '@/lib/native';
import { currentInstallPrompt, takeInstallPrompt, isPwaStandalone, pwaEvent, pwaPlatform } from '@/lib/pwa';
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
  const visible = !isNativeApp() && !installed && (manual || (!dismissed && (environment.ios || !!currentInstallPrompt())));
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
    if (!prompt) { setHelp(true); return; }
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
        <img src="/icon-192-v2.png" alt="" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1"><p className="font-semibold">Установить Sortirovka 24</p>
          <p className="mt-1 text-sm text-gray-500">S24 появится на главном экране и будет открываться как приложение.</p>
          <button disabled={busy} onClick={() => void install()} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white"><Download size={18} />{busy ? 'Открываем…' : 'Установить Sortirovka 24'}</button>
        </div>
        {!manual && <button aria-label="Закрыть предложение установки" className="self-start p-2" onClick={() => { try { localStorage.setItem('s24_install_dismissed_at', String(Date.now())); } catch { /* storage optional */ } setDismissed(true); }}><X size={20} /></button>}
      </div>
    </div>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
      <DialogTitle>Установите Sortirovka 24</DialogTitle><DialogDescription>Установка займёт несколько секунд. Используйте меню самого браузера.</DialogDescription>
      {environment.embedded ? <p>Откройте сайт в {environment.ios ? 'Safari' : 'Chrome'} через меню этого браузера. Встроенные браузеры мессенджеров могут не поддерживать установку.</p>
      : environment.ios ? <><p>{environment.browser === 'chrome' ? 'В Chrome на iPhone нажмите значок «Поделиться» справа от адресной строки.' : environment.browser === 'safari' ? 'В Safari нажмите «Поделиться» (или откройте меню «⋯», затем «Поделиться»).' : 'Для надёжной установки откройте этот адрес в Safari. Если ваш браузер предлагает «Добавить на экран Домой» в меню «Поделиться», можно использовать его.'}</p>
        <ol className="list-decimal space-y-3 pl-6"><li><Share className="inline h-5 w-5" /> Откройте «Поделиться» в браузере.</li><li>Выберите «Добавить на экран Домой». Если пункта нет в Safari: «Изменить действия» → добавьте его.</li><li>Если есть переключатель «Открывать как веб-приложение», включите его.</li><li>Нажмите «Добавить» и запустите S24 с новой иконки.</li></ol></>
      : <><p>{environment.browser === 'samsung' ? 'В Samsung Internet откройте меню ☰ → «Добавить страницу в» → «Главный экран». Выберите установку приложения, если браузер предлагает её.' : 'В Chrome/Edge откройте меню ⋮ → «Установить Sortirovka 24» или «Установить приложение». На компьютере также доступен значок установки в адресной строке.'}</p><p>Если браузер предлагает только ссылку на сайт, откройте HTTPS-адрес ниже в актуальном Chrome, дождитесь загрузки и повторите. Системная установка недоступна в некоторых встроенных браузерах.</p></>}
      <p className="break-all rounded-xl bg-blue-50 p-3 text-blue-900">https://www.sortirovka24.kz/</p>
      <button className="min-h-11 rounded-xl border px-4" onClick={() => void navigator.clipboard?.writeText('https://www.sortirovka24.kz/')}>Скопировать адрес</button>
    </DialogContent></Dialog>
  </>;
}
