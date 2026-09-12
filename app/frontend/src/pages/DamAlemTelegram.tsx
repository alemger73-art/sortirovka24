import { useEffect, useRef, useState } from 'react';
import { foodOperations } from '@/lib/foodOperations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
interface Config { enabled: boolean; chat_id: string; has_token: boolean; status_updates: boolean }
export default function DamAlemTelegram() {
  const [config, setConfig] = useState<Config | null>(null), [token, setToken] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = () => foodOperations<Config>('/telegram').then(setConfig).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!config || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await foodOperations<Config>('/telegram', 'PUT', { enabled: config.enabled, chat_id: config.chat_id, status_updates: config.status_updates, ...(token.trim() ? { token: token.trim() } : {}) }); setConfig(result); setToken(''); setMessage('Настройки сохранены'); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  async function test() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await foodOperations<{ chat: string }>('/telegram/test', 'POST'); setMessage(`Тестовое сообщение отправлено: ${result.chat}`); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="max-w-2xl rounded-2xl border bg-white p-5 space-y-5"><h3 className="font-bold text-xl">Уведомления в Telegram</h3><p className="text-sm text-gray-600">Заказы всегда остаются в кабинете. В канал приходят номер, статус и ссылка на заказ. Имя, телефон и адрес клиента доступны после входа в кабинет.</p><ol className="list-decimal pl-5 text-sm space-y-2"><li>Создайте бота через @BotFather и скопируйте его токен.</li><li>Добавьте бота в рабочий канал администратором с правом публикации сообщений.</li><li>Укажите токен и ID канала (−100…) или @имя канала. Сохраните настройки и отправьте тест.</li><li>Включите уведомления и сохраните. Неотправленные уведомления из очереди тоже начнут приходить.</li></ol>{error && <p role="alert" className="bg-red-50 p-3 rounded-lg text-red-800">{error}</p>}{message && <p role="status" className="bg-green-50 p-3 rounded-lg text-green-800">{message}</p>}{!config ? <Button onClick={() => void load()}>Загрузить настройки</Button> : <fieldset disabled={busy} className="space-y-4"><label className="block text-sm font-medium">Токен бота<Input type="password" autoComplete="new-password" aria-label="Токен бота" placeholder={config.has_token ? 'Сохранён. Введите новый только для замены' : '123456:…'} value={token} onChange={e => setToken(e.target.value)} /></label><label className="block text-sm font-medium">Канал или группа<Input aria-label="Канал или группа" placeholder="−1001234567890" value={config.chat_id || ''} onChange={e => setConfig({ ...config, chat_id: e.target.value })} /></label><label className="flex gap-2 items-start"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /><span>Отправлять уведомления о заказах в указанный канал</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={config.status_updates} onChange={e => setConfig({ ...config, status_updates: e.target.checked })} /><span>Сообщать также об изменении статуса</span></label><div className="flex flex-wrap gap-2"><Button onClick={() => void save()}>Сохранить настройки</Button><Button variant="outline" onClick={() => void test()}>Отправить тест в сохранённый канал</Button></div><p className="text-xs text-gray-500">Токен хранится на сервере в зашифрованном виде и не возвращается в браузер. Для управления заказом из Telegram используйте ссылку на кабинет.</p></fieldset>}</section>;
}
