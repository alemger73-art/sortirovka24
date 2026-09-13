import { useLanguage } from '@/contexts/LanguageContext';
import { getPublicLocale } from '@/i18n/publicLocale';
import { useEffect, useRef, useState } from 'react';
import { foodOperations } from '@/lib/foodOperations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
interface Config { enabled: boolean; chat_id: string; has_token: boolean; status_updates: boolean }
export default function DamAlemTelegram() {
  const { t: adminT, lang } = useLanguage();
  const locale = getPublicLocale(lang);

  const [config, setConfig] = useState<Config | null>(null), [token, setToken] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [testChat, setTestChat] = useState('');
  const lock = useRef(false);
  const load = () => foodOperations<Config>('/telegram').then(setConfig).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!config || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await foodOperations<Config>('/telegram', 'PUT', { enabled: config.enabled, chat_id: config.chat_id, status_updates: config.status_updates, ...(token.trim() ? { token: token.trim() } : {}) }); setConfig(result); setToken(''); setMessage('admin.dam.final.184'); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  async function test() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await foodOperations<{ chat: string }>('/telegram/test', 'POST'); setTestChat(result.chat); setMessage('admin.dam.final.185'); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="max-w-2xl rounded-2xl border bg-white p-5 space-y-5"><h3 className="font-bold text-xl">{adminT('admin.dam.final.186')}</h3><p className="text-sm text-gray-600">{adminT('admin.dam.final.187')}</p><ol className="list-decimal pl-5 text-sm space-y-2"><li>{adminT('admin.dam.final.188')}</li><li>{adminT('admin.dam.final.189')}</li><li>{adminT('admin.dam.final.190')}</li><li>{adminT('admin.dam.final.191')}</li></ol>{error && <p role="alert" className="bg-red-50 p-3 rounded-lg text-red-800">{error}</p>}{message && <p role="status" className="bg-green-50 p-3 rounded-lg text-green-800">{adminT(message).replace('{0}', () => testChat)}</p>}{!config ? <Button onClick={() => void load()}>{adminT('admin.dam.final.192')}</Button> : <fieldset disabled={busy} className="space-y-4"><label className="block text-sm font-medium">{adminT('admin.dam.final.193')}<Input type="password" autoComplete="new-password" aria-label={adminT('admin.dam.final.193')} placeholder={config.has_token ? adminT('admin.dam.final.194') : '123456:…'} value={token} onChange={e => setToken(e.target.value)} /></label><label className="block text-sm font-medium">{adminT('admin.dam.final.195')}<Input aria-label={adminT('admin.dam.final.195')} placeholder="−1001234567890" value={config.chat_id || ''} onChange={e => setConfig({ ...config, chat_id: e.target.value })} /></label><label className="flex gap-2 items-start"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /><span>{adminT('admin.dam.final.196')}</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={config.status_updates} onChange={e => setConfig({ ...config, status_updates: e.target.checked })} /><span>{adminT('admin.dam.final.197')}</span></label><div className="flex flex-wrap gap-2"><Button onClick={() => void save()}>{adminT('admin.dam.final.198')}</Button><Button variant="outline" onClick={() => void test()}>{adminT('admin.dam.final.199')}</Button></div><p className="text-xs text-gray-500">{adminT('admin.dam.final.200')}</p></fieldset>}</section>;
}
