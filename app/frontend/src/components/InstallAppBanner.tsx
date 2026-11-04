import { useEffect, useState } from 'react';
import { Check, Copy, Download, Share, X } from 'lucide-react';
import { isNativeApp } from '@/lib/native';
import { currentInstallPrompt, takeInstallPrompt, isPwaStandalone, pwaEvent, pwaPlatform, chromeIntentUrl, needsChromeForInstall, takeInstallLinkMark, iosSafariMenuLayout, takeChromeTried } from '@/lib/pwa';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/** One-tap install. Chrome on Android and Edge/Samsung when they offer it: the system install
 *  window. Any other Android browser or in-app window: «Установить» opens the page in Chrome,
 *  where a sheet with one big button is waiting. iPhone: steps for the current browser (Apple allows no button). */
export default function InstallAppBanner({ manual = false }: { manual?: boolean }) {
  const [ready, setReady] = useState(0);
  const [help, setHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem('s24_install_dismissed_at')) < 7 * 86400000; } catch { return false; }
  });
  const [installed, setInstalled] = useState(isPwaStandalone);
  const [busy, setBusy] = useState(false);
  const environment = pwaPlatform();
  const viaChrome = !currentInstallPrompt() && needsChromeForInstall();
  const visible = !isNativeApp() && !installed && (manual || (!dismissed && (environment.ios || !!currentInstallPrompt() || viaChrome)));
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
      // Any Android window without the system offer (other browsers, in-app windows, the «✕» window opened from
      // WhatsApp/Telegram) → full Chrome, where a sheet with one big button waits.
      if (environment.platform === 'android' && !(environment.browser === 'chrome' && takeChromeTried())) { pwaEvent('pwa_open_in_chrome'); window.location.href = chromeIntentUrl(); return; }
      pwaEvent('pwa_install_help_shown'); setHelp(true); return;
    }
    setBusy(true);
    try {
      pwaEvent('pwa_install_prompt_shown'); await prompt.prompt();
      const result = await prompt.userChoice;
      pwaEvent(result.outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed');
    } catch { setHelp(true); }
    finally { setBusy(false); }
  }
  if (isPwaStandalone() || !visible) return null;
  return <>
    <div data-install-banner data-ready={ready} className={manual ? '' : 'fixed inset-x-0 z-[45] p-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-3'}>
      <div className="mx-auto flex max-w-lg gap-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-900 dark:bg-gray-900">
        <img src="/icon-192-v4.png" alt="" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1"><p className="font-semibold">Приложение «Сортировка 24»</p>
          <p className="mt-1 text-sm text-gray-500">«Сортировка 24» появится на главном экране и будет открываться как приложение.</p>
          <button disabled={busy} onClick={() => void install()} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white"><Download size={18} />{busy ? 'Открываем…' : 'Установить'}</button>
        </div>
        {!manual && <button aria-label="Закрыть предложение установки" className="self-start p-2" onClick={() => { try { localStorage.setItem('s24_install_dismissed_at', String(Date.now())); } catch { /* storage optional */ } setDismissed(true); }}><X size={20} /></button>}
      </div>
    </div>
    <InstallHelp open={help} onOpenChange={setHelp} />
  </>;
}

const stepIcon = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950';

/** iPhone steps for the browser the visitor is in: Safari 26 (menu «•••»), older Safari, Chrome, other browsers and in-app windows. */
function IosSteps() {
  const environment = pwaPlatform();
  const [copied, setCopied] = useState(false);
  const inSafari = environment.browser === 'safari' && !environment.embedded;
  const inChrome = environment.browser === 'chrome' && !environment.embedded;
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.origin + '/'); setCopied(true); } catch { setCopied(false); }
  }
  const finish = [
    <p key="home" className="flex items-center gap-3"><span className={`${stepIcon} text-xl font-bold`}>+</span>Прокрутите список вниз и выберите «На экран „Домой“»</p>,
    <p key="add" className="flex items-center gap-3"><span className={`${stepIcon} text-sm font-bold`}>OK</span>Нажмите «Добавить» вверху справа</p>,
  ];
  if (!inSafari && !inChrome) {
    return <div className="space-y-4 text-base text-slate-700 dark:text-slate-200">
      <p>{environment.embedded ? 'Сайт открыт внутри другого приложения — отсюда установить нельзя. Откройте его в Safari:' : 'Установить удобнее всего из Safari:'}</p>
      {environment.embedded && <p className="flex items-center gap-3"><span className={`${stepIcon} font-bold`}>•••</span>Нажмите «•••» или значок компаса и выберите «Открыть в Safari» («Открыть в браузере»)</p>}
      <button type="button" onClick={() => void copy()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 py-2 font-semibold text-blue-700 dark:border-blue-900 dark:text-blue-300">
        {copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Ссылка скопирована — вставьте её в Safari' : 'Скопировать ссылку для Safari'}
      </button>
    </div>;
  }
  return <div className="space-y-4 text-base text-slate-700 dark:text-slate-200">
    {inChrome
      ? <p className="flex items-center gap-3"><span className={stepIcon}><Share size={20} /></span>Нажмите «Поделиться» справа в адресной строке (или меню «•••» → «Поделиться»)</p>
      : iosSafariMenuLayout()
        ? <p className="flex items-center gap-3"><span className={`${stepIcon} font-bold`}>•••</span>Нажмите «•••» в строке адреса внизу, затем «Поделиться»</p>
        : <p className="flex items-center gap-3"><span className={stepIcon}><Share size={20} /></span>Нажмите «Поделиться» внизу экрана (на iPad — вверху)</p>}
    {finish}
    <p className="text-sm text-slate-500 dark:text-slate-400">Откройте «Сортировка 24» с главного экрана. Если попросит — войдите по номеру ещё раз. Уведомления на iPhone приходят только в установленное приложение.</p>
  </div>;
}

function InstallHelp({ open, onOpenChange, noChrome = false }: { open: boolean; onOpenChange: (v: boolean) => void; noChrome?: boolean }) {
  const environment = pwaPlatform();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-2xl bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
    <DialogTitle>Установить «Сортировка 24»</DialogTitle>
    {environment.ios ? <DialogDescription asChild><div><IosSteps /></div></DialogDescription>
    : <DialogDescription asChild><div className="flex items-center gap-3 text-base text-slate-700 dark:text-slate-200">
      <span className={`${stepIcon} text-xl font-bold`}>⋮</span>
      <p>{noChrome ? 'На телефоне нет Chrome. Откройте меню браузера (⋮ или ☰) и выберите «Добавить на главный экран».'
        : environment.browser === 'samsung' ? 'Откройте меню ☰ внизу и выберите «Добавить страницу на» → «Главный экран».'
        : 'Откройте меню ⋮ вверху справа и выберите «Установить приложение» или «Добавить на главный экран». Если вверху крестик ✕ — сначала ⋮ → «Открыть в Chrome». Если в меню «Открыть приложение» — оно уже установлено.'}</p>
    </div></DialogDescription>}
  </DialogContent></Dialog>;
}

/** Page opened from another browser by «Установить»: one big button right away. Mounted on every page. */
export function InstallFromLink() {
  const [mark] = useState(() => (isNativeApp() || isPwaStandalone() ? null : takeInstallLinkMark()));
  const [open, setOpen] = useState(mark === '1');
  const [help, setHelp] = useState(mark === 'nochrome');
  const [, setTick] = useState(0);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (mark === 'nochrome') pwaEvent('pwa_chrome_missing');
    if (mark !== '1') return;
    const refresh = () => setTick(n => n + 1);
    const done = () => setOpen(false);
    window.addEventListener('s24:install-ready', refresh);
    window.addEventListener('appinstalled', done);
    const timer = window.setTimeout(() => setWaited(true), 4000);
    return () => { window.removeEventListener('s24:install-ready', refresh); window.removeEventListener('appinstalled', done); clearTimeout(timer); };
  }, [mark]);
  async function install() {
    const prompt = takeInstallPrompt();
    if (!prompt) { setWaited(true); return; }
    pwaEvent('pwa_install_prompt_shown');
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      pwaEvent(result.outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed');
      if (result.outcome === 'accepted') setOpen(false);
    } catch { setWaited(true); }
  }
  if (!mark) return null;
  const canPrompt = !!currentInstallPrompt();
  return <>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-2xl bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/icon-192-v4.png" alt="" className="h-16 w-16 rounded-2xl" />
        <DialogTitle>Установить «Сортировка 24»</DialogTitle>
        <DialogDescription>Приложение появится на главном экране — без магазина приложений, за пару секунд.</DialogDescription>
        <button onClick={() => void install()} disabled={!canPrompt && !waited} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-lg font-semibold text-white disabled:opacity-60">
          <Download size={20} />{canPrompt || waited ? 'Установить' : 'Подготавливаем…'}
        </button>
        {waited && !canPrompt && <p className="text-sm text-slate-600 dark:text-slate-300">Если окно установки не появилось: меню <b>⋮</b> вверху справа → «Установить приложение». Если там «Открыть приложение» — оно уже установлено.</p>}
      </div>
    </DialogContent></Dialog>
    <InstallHelp open={help} onOpenChange={setHelp} noChrome />
  </>;
}
