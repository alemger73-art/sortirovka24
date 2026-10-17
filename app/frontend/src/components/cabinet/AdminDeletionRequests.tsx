import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/config';
import { getRequestSessionToken } from '@/lib/requestSession';

type Item = { id: string; user_id: string; name?: string; phone?: string; email?: string; requested_at: string; due_at: string };
type Inventory = { active_operations: Record<string, number>; media_references: string[]; manual_review: string[] };
async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(apiUrl(`/api/v1/account-deletion/admin${path}`), {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRequestSessionToken() || ''}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось обработать заявку. Проверьте заполнение полей.');
  return data;
}

export default function AdminDeletionRequests() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [basis, setBasis] = useState('');
  const [until, setUntil] = useState('');
  const [checks, setChecks] = useState([false, false, false]);
  async function load() {
    setError('');
    try { const data = await request<{ items: Item[] }>(''); setItems(data.items); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить заявки'); }
  }
  useEffect(() => { void load(); }, []);
  async function select(item: Item) {
    setSelected(item); setInventory(null); setError(''); setEvidence(''); setBasis(''); setUntil(''); setChecks([false, false, false]); setBusy(true);
    try { setInventory((await request<{ inventory: Inventory }>(`/${item.id}`)).inventory); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось открыть заявку'); }
    finally { setBusy(false); }
  }
  async function complete() {
    if (!selected || !inventory || busy || !checks.every(Boolean)) return;
    setBusy(true); setError('');
    try {
      await request(`/${selected.id}/complete`, {
        confirmed: true, related_data_processed: true, provider_files_processed: true, backups_and_processors_recorded: true, evidence,
        retained_records: ['operational_records', 'legal_receipts'].map(category => ({ category, legal_basis: basis, delete_after: until })),
      });
      setSelected(null); setInventory(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Удаление не завершено'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-red-200 p-4 dark:border-red-900">
    <div className="flex items-center justify-between"><h2 className="font-semibold">Заявки на удаление аккаунтов</h2><button type="button" className="underline" disabled={busy} onClick={() => void load()}>Обновить</button></div>
    <p className="text-sm">Сначала обработайте связанные данные и файлы. Завершение необратимо: удаляет профиль, входы, адреса, настройки, уведомления, публикации и доступ аккаунта. Записи расчётов и согласий требуют отдельного решения о хранении.</p>
    {items.length === 0 && <p className="text-sm">Нет загруженных заявок.</p>}
    {items.map(item => <button type="button" key={item.id} disabled={busy} onClick={() => void select(item)} className="block w-full rounded-lg border p-3 text-left text-sm">
      <span className="font-medium">{item.name || item.user_id}</span> · {item.phone || item.email}<br />Обработать до {new Date(item.due_at).toLocaleDateString('ru-RU')}
    </button>)}
    {selected && inventory && <div className="space-y-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
      <p className="break-all text-sm">Заявка {selected.id}</p>
      {Object.keys(inventory.active_operations).length > 0 && <p role="alert" className="text-red-600">Есть незавершённые операции. Завершение удаления заблокировано.</p>}
      <details><summary>Файлы для проверки удаления у провайдеров ({inventory.media_references.length})</summary>{inventory.media_references.map((ref, i) => <p key={i} className="break-all text-xs">{ref}</p>)}</details>
      <label className="block text-sm">Отчёт об обработке связанных записей и файлов (без паролей и копий личных данных)<textarea className="mt-1 w-full rounded border p-2 dark:bg-gray-950" minLength={30} maxLength={4000} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
      <label className="block text-sm">Что осталось, правовое основание хранения или результат удаления<textarea className="mt-1 w-full rounded border p-2 dark:bg-gray-950" minLength={10} maxLength={1000} value={basis} onChange={e => setBasis(e.target.value)} /></label>
      <label className="block text-sm">Дата/условие удаления оставшихся записей<input className="mt-1 w-full rounded border p-2 dark:bg-gray-950" minLength={10} maxLength={200} value={until} onChange={e => setUntil(e.target.value)} /></label>
      {['Связанные записи, включая старые записи по телефону и рабочие профили, обработаны; законные исключения перечислены в отчёте.', 'Файлы и копии у провайдеров обработаны; оставшиеся обязательные документы указаны в отчёте.', 'Удаления для резервных копий и поручения обработчикам зафиксированы. Пользователю переданы результат и исключения хранения.'].map((label, i) => <label key={i} className="flex gap-2 text-sm"><input type="checkbox" checked={checks[i]} onChange={e => setChecks(previous => previous.map((value, index) => index === i ? e.target.checked : value))} />{label}</label>)}
      <button type="button" onClick={() => void complete()} disabled={busy || !checks.every(Boolean) || evidence.trim().length < 30 || basis.trim().length < 10 || until.trim().length < 10 || Object.keys(inventory.active_operations).length > 0} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">Завершить удаление без возможности восстановления</button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
