import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { client, withRetry, DIRECTORY_CATEGORIES, sortDirectoryEntries } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { type DirectoryEntry, isLegacyDemo, isNationalEmergency, phoneLink, httpsLink, whatsappLink, matchesEntry, readyForDirectory } from '@/lib/directoryContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const categories = [...DIRECTORY_CATEGORIES, 'Государственные услуги', 'Социальная помощь', 'Прочее'];
const labelStyle = 'grid gap-1.5 text-sm font-medium';
export default function AdminDirectory() {
  const [items, setItems] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(false);
  const [edit, setEdit] = useState<Partial<DirectoryEntry> | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const generation = useRef(0);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  async function load() {
    const version = ++generation.current; setLoading(true); setLoadError(false);
    try {
      const all: DirectoryEntry[] = [];
      for (let skip = 0; ; skip += 200) {
        const res = await withRetry(() => client.entities.directory_entries.query({ sort: 'id', skip, limit: 200 }));
        const page = res.data?.items || []; all.push(...page);
        if (page.length < 200 || all.length >= (res.data?.total ?? Infinity)) break;
      }
      if (version === generation.current) setItems(sortDirectoryEntries(all));
    } catch { if (version === generation.current) setLoadError(true); }
    finally { if (version === generation.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  const patch = (key: keyof DirectoryEntry, value: string | boolean | number) => setEdit(previous => previous ? { ...previous, [key]: value } : previous);
  function open(item?: DirectoryEntry) { setError(''); setEdit(item ? { ...item } : { entry_name: '', category: 'Коммунальные службы', is_published: false, sort_order: 0 }); }
  async function save() {
    if (!edit || lock.current) return;
    setError('');
    if (!edit.entry_name?.trim() || !edit.category?.trim()) return setError('Заполните название и категорию.');
    for (const field of ['website', 'map_url', 'source_url'] as const) if (edit[field] && !httpsLink(edit[field])) return setError('Ссылки должны начинаться с https:// и не содержать логин или пароль.');
    if (edit.phone && !phoneLink(edit.phone)) return setError('Укажите один телефон без комментариев; добавочный номер можно написать в описании.');
    if (edit.whatsapp && !whatsappLink(edit.whatsapp)) return setError('Для WhatsApp нужен полный номер с кодом страны.');
    if (edit.verified_at && (!/^\d{4}-\d{2}-\d{2}$/.test(edit.verified_at) || edit.verified_at > new Date().toLocaleDateString('sv-SE'))) return setError('Проверьте дату: она не должна быть в будущем.');
    if (edit.is_published !== false && (!edit.source_url || !edit.verified_at || (!edit.phone && !edit.website))) return setError('Для публикации укажите источник, дату проверки и телефон или сайт организации.');
    if (edit.is_published !== false && (isLegacyDemo(edit as DirectoryEntry) || isNationalEmergency(edit as DirectoryEntry))) return setError('Общереспубликанские экстренные номера уже вынесены в отдельный блок. Шаблонные местные контакты нужно заменить достоверными.');
    const { id, ...data } = edit;
    lock.current = true; setBusy(true);
    try {
      const cleaned = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      if (id) await client.entities.directory_entries.update({ id: String(id), data: cleaned });
      else await client.entities.directory_entries.create({ data: cleaned });
      invalidateAllCaches(); setEdit(null); setNotice(data.is_published === false ? 'Черновик сохранён. Посетители его не видят.' : 'Запись сохранена.'); await load();
    } catch { setError('Не удалось подтвердить сохранение. Проверьте соединение; перед повторным созданием обновите список, чтобы исключить дубликат.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove(item: DirectoryEntry) {
    if (lock.current || !confirm(`Удалить «${item.entry_name}»? Можно вместо удаления сохранить запись как черновик.`)) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await client.entities.directory_entries.delete({ id: String(item.id) }); invalidateAllCaches(); setNotice('Запись удалена.'); await load(); }
    catch { setNotice('Не удалось удалить запись. Обновите список и проверьте результат.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const visible = items.filter(e => matchesEntry(e, search) && (status === 'all' || (status === 'draft' ? e.is_published === false : status === 'review' ? !readyForDirectory(e) && e.is_published !== false : readyForDirectory(e))));
  return <div className="space-y-5">
    <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 p-4 space-y-2"><h2 className="font-bold text-lg">Полезный справочник</h2><p className="text-sm text-slate-600 dark:text-slate-300">Одна карточка — одна организация или служба. Объясните, с каким вопросом обращаться, укажите точный адрес и часы приёма. Телефон, сайт и WhatsApp — отдельные поля.</p><p className="text-sm">Номера 112, 101, 102, 103 и 104 уже есть в постоянном блоке. Их не нужно дублировать. Старые записи без источника требуют проверки.</p><Link to="/directory" className="inline-block py-2 text-teal-700 dark:text-teal-300 underline">Открыть справочник для посетителей ↗</Link></div>
    <div className="flex flex-wrap items-end gap-3"><label className={`${labelStyle} flex-1 min-w-[180px]`}>Поиск<Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Название, адрес или номер" /></label><label className={labelStyle}>Показать<select className="h-10 rounded-md border bg-background px-3" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Все записи</option><option value="published">Опубликованные</option><option value="draft">Черновики</option><option value="review">Требуют проверки</option></select></label><Button disabled={busy || loading || loadError} onClick={() => open()}><Plus size={16} className="mr-2" />Добавить</Button></div>
    {notice && <p role="status" className="rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-sm">{notice}</p>}
    {loading ? <p role="status">Загрузка записей…</p> : loadError ? <div role="alert" className="rounded-lg border border-red-200 p-4">Не удалось загрузить справочник. <Button variant="outline" onClick={() => void load()}>Повторить</Button></div> : <><p className="text-sm text-slate-500">Показано: {visible.length} из {items.length}</p>{!visible.length && <p className="p-6 text-center">Записей не найдено. Измените фильтр или добавьте организацию.</p>}{visible.map(item => <article key={item.id} className="rounded-xl border p-4 flex items-start gap-3">
      <div className="min-w-0 flex-1 break-words"><div className="text-xs text-slate-500 mb-1">{item.category || 'Прочее'} · {item.is_published === false ? 'Черновик' : readyForDirectory(item) ? 'Опубликовано' : 'На проверке'}</div><h3 className="font-semibold">{item.entry_name || 'Без названия'}</h3><p className="text-sm mt-1">{item.phone || 'Телефон не указан'}{item.address && ` · ${item.address}`}</p>{isLegacyDemo(item) ? <p className="text-sm text-amber-700 mt-2">Шаблонные данные из старой заготовки. Скрыты от посетителей до заполнения источника и проверки.</p> : isNationalEmergency(item) ? <p className="text-sm text-amber-700 mt-2">Показывается в постоянном блоке экстренных номеров; эта копия скрыта.</p> : (!item.source_url || !item.verified_at) && <p className="text-sm text-amber-700 mt-2">Нужна проверка: укажите источник и дату.</p>}</div>
      <div className="flex flex-col sm:flex-row gap-1"><Button variant="outline" size="icon" disabled={busy} aria-label={`Редактировать ${item.entry_name}`} onClick={() => open(item)}><Pencil size={16} /></Button><Button variant="outline" size="icon" disabled={busy} aria-label={`Удалить ${item.entry_name}`} onClick={() => void remove(item)}><Trash2 size={16} /></Button></div>
    </article>)}</>}
    <Dialog open={!!edit} onOpenChange={value => { if (!value && !lock.current) setEdit(null); }}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{edit?.id ? 'Редактировать контакт' : 'Новый контакт'}</DialogTitle><DialogDescription>Сохраните черновик, если сведения ещё нужно проверить.</DialogDescription></DialogHeader>{edit && <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className="space-y-4">
        <label className={labelStyle}>Название организации *<Input maxLength={200} value={edit.entry_name || ''} onChange={e => patch('entry_name', e.target.value)} /></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className={labelStyle}>Категория *<Input list="directory-admin-categories" maxLength={200} value={edit.category || ''} onChange={e => patch('category', e.target.value)} /><datalist id="directory-admin-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></label><label className={labelStyle}>Порядок в категории<Input type="number" min={0} max={100000} value={edit.sort_order ?? 0} onChange={e => patch('sort_order', Number(e.target.value))} /></label></div>
        <label className={labelStyle}>С какими вопросами обращаться<Textarea maxLength={4000} rows={3} value={edit.description || ''} onChange={e => patch('description', e.target.value)} placeholder="Коротко о помощи или услугах. Условия приёма, если они известны." /></label>
        <label className={labelStyle}>Адрес<Input maxLength={4000} value={edit.address || ''} onChange={e => patch('address', e.target.value)} placeholder="Город, улица, дом, вход или кабинет" /></label>
        <label className={labelStyle}>Часы работы<Textarea maxLength={4000} rows={2} value={edit.opening_hours || ''} onChange={e => patch('opening_hours', e.target.value)} placeholder="Например: Пн–Пт 09:00–18:00, перерыв 13:00–14:00. Только подтверждённый график." /></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className={labelStyle}>Телефон<Input type="tel" value={edit.phone || ''} onChange={e => patch('phone', e.target.value)} placeholder="+7 … или короткий номер" /></label><label className={labelStyle}>WhatsApp<Input type="tel" value={edit.whatsapp || ''} onChange={e => patch('whatsapp', e.target.value)} placeholder="Отдельный подтверждённый номер" /></label></div>
        {([['website', 'Сайт организации'], ['map_url', 'Ссылка на карту'], ['source_url', 'Источник сведений']] as const).map(([key, title]) => <label key={key} className={labelStyle}>{title}<Input maxLength={2000} value={edit[key] || ''} onChange={e => patch(key, e.target.value)} placeholder="https://…" /></label>)}
        <p className="text-xs text-slate-500">Источник — страница организации или государственного органа, где можно сверить контакты. Не ставьте сегодняшнюю дату без проверки.</p>
        <label className={labelStyle}>Дата проверки контактов<Input type="date" max={new Date().toLocaleDateString('sv-SE')} value={edit.verified_at || ''} onChange={e => patch('verified_at', e.target.value)} /></label>
        <label className="flex items-start gap-3 p-3 rounded-lg border text-sm"><input className="mt-1" type="checkbox" checked={edit.is_published !== false} onChange={e => patch('is_published', e.target.checked)} /><span>Опубликовать для посетителей<br /><small className="text-slate-500">Нужны источник, дата проверки и телефон или сайт.</small></span></label>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Отмена</Button><Button type="submit">{busy ? 'Сохранение…' : edit.is_published === false ? 'Сохранить черновик' : 'Сохранить и опубликовать'}</Button></div>
      </fieldset>
    </form>}</DialogContent></Dialog>
  </div>;
}
