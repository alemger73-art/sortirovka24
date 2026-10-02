import { useEffect, useState } from 'react';
import { getPartnerToken } from '@/lib/partnerAuthApi';
import { getAccountToken } from '@/lib/accountApi';
import { getAPIBaseURL } from '@/lib/config';
import { currentInstallPrompt, isPwaStandalone, pwaPlatform } from '@/lib/pwa';

export default function PwaDiagnostics() {
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void (async () => {
      const tokens = [...new Set([localStorage.getItem('_sp924_token'), getPartnerToken('dam_alem'), getAccountToken()].filter(Boolean))];
      for (const token of tokens) {
        const response = await fetch(getAPIBaseURL().replace(/\/$/, '') + '/api/v1/push/diagnostics-access', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (response.ok) { const data = await response.json(); if (alive) { setAllowed(true); setConfigured(!!data.web_push_configured); } return; }
      }
      if (alive) setError('Войдите в кабинет владельца DÄM ALEM или администратора проекта.');
    })().catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);
  async function run() {
    setBusy(true); setError('');
    try {
      const environment = pwaPlatform();
      const manifestUrl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
      const response = manifestUrl ? await fetch(manifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) }) : null;
      const manifest = response?.ok ? await response.json() : null;
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
      const sub = reg && 'PushManager' in window ? await reg.pushManager.getSubscription() : null;
      const out: Record<string, string> = {
        Platform: environment.platform, Browser: environment.browser, HTTPS: String(window.isSecureContext),
        'Manifest loaded': String(!!manifest), 'Manifest URL': manifestUrl || 'нет', 'Start URL': manifest?.start_url || 'нет', Scope: manifest?.scope || 'нет',
        Display: manifest?.display || 'нет', 'SW registered': String(!!reg), 'SW script': reg?.active?.scriptURL || 'нет', 'SW state': reg?.active?.state || 'нет',
        'SW waiting': String(!!reg?.waiting), Standalone: String(isPwaStandalone()), 'navigator.standalone': String((navigator as Navigator & { standalone?: boolean }).standalone),
        'Push supported': String('PushManager' in window && 'Notification' in window), Permission: 'Notification' in window ? Notification.permission : 'unsupported',
        'Server Web Push configured': String(configured),
        'Subscription exists': String(!!sub), 'beforeinstallprompt captured': String(!!currentInstallPrompt()),
        'Installability status': isPwaStandalone() ? 'Запущено как приложение' : currentInstallPrompt() ? 'Браузер предложил системную установку' : environment.ios ? 'Установка через системное меню «Поделиться»' : 'Системный prompt пока не получен; проверьте DevTools → Application → Manifest',
      };
      if (reg?.active) {
        out['SW version'] = await new Promise<string>(resolve => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => { channel.port1.close(); resolve('Старая версия / нет ответа'); }, 1500);
          channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(String(event.data.version)); };
          reg.active!.postMessage({ type: 'PWA_VERSION' }, [channel.port2]);
        });
      }
      setResults(out);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка диагностики'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-screen max-w-3xl p-6"><h1 className="text-2xl font-bold">Диагностика PWA Sortirovka 24</h1>
    {error && <p role="alert" className="mt-4 text-red-600">{error}</p>}
    {!allowed ? <p className="mt-4">Доступ только владельцу или администратору.</p> : <><button className="my-5 rounded-xl bg-blue-600 p-3 text-white disabled:opacity-50" disabled={busy} onClick={() => void run()}>{busy ? 'Проверяем…' : 'Run PWA diagnostics'}</button>
      <dl className="space-y-3">{Object.entries(results).map(([key, value]) => <div className="rounded-xl border p-3" key={key}><dt className="font-semibold">{key}</dt><dd className="break-all text-sm">{value}</dd></div>)}</dl></>}
  </main>;
}
