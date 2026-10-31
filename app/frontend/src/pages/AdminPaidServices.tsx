/** Admin: paid services (hosting, domain, subscriptions) — payment dates and Telegram reminders. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CURRENCIES, PERIODS, dueLabel, paidApi, type PaidOverview, type PaidService, type PaidServiceInput } from '@/lib/paidServices';

const EMPTY: PaidServiceInput = { name: '', amount: 0, currency: 'KZT', period: 'month', due_date: '', pay_url: '', note: '', active: true };
const TONES = {
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};
const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900';

function ruDate(iso: string) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AdminPaidServices() {
  const [data, setData] = useState<PaidOverview | null>(null);
  const [edit, setEdit] = useState<{ id?: number; value: PaidServiceInput } | null>(null);
  const [busy, setBusy] = useState('');

  const load = () => paidApi.list().then(setData).catch((e) => toast.error(e?.message || 'Не удалось загрузить'));
  useEffect(() => { void load(); }, []);

  async function run(key: string, fn: () => Promise<PaidOverview | { ok: boolean }>, ok: string) {
    setBusy(key);
    try {
      const r = await fn();
      if ('items' in r) setData(r);
      toast.success(('answer' in r && typeof r.answer === 'string') ? r.answer : ok);
      return true;
    } catch (e: any) { toast.error(e?.message || 'Не получилось'); return false; } finally { setBusy(''); }
  }
  async function save() {
    if (!edit) return;
    const { id, value } = edit;
    if (await run('save', () => (id ? paidApi.update(id, value) : paidApi.create(value)), 'Сохранено')) setEdit(null);
  }
  const startEdit = (s?: PaidService) => setEdit(s ? { id: s.id, value: { name: s.name, amount: s.amount, currency: s.currency, period: s.period, due_date: s.due_date, pay_url: s.pay_url, note: s.note, active: s.active } } : { value: { ...EMPTY } });
  const set = (patch: Partial<PaidServiceInput>) => setEdit((e) => (e ? { ...e, value: { ...e.value, ...patch } } : e));

  if (!data) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  const active = data.items.filter((s) => s.active);
  const noDate = active.filter((s) => !s.due_date).length;

  return (
    <div className="space-y-4" data-testid="admin-paid-services">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <p className="font-semibold">Как работают напоминания</p>
        <p className="mt-1">Каждое утро в 10:00 бот пишет в Телеграм за 7, 3 и 1 день до оплаты, в день оплаты и каждый день, если оплата просрочена. Под сообщением кнопка «✅ Оплачено» — она переносит дату на следующий период.</p>
        <p className="mt-2">
          {data.chat
            ? <>Сообщения приходят в группу <b>«{data.chat.title}»</b>.</>
            : <>Сейчас сообщения приходят вам в личный чат с ботом. Чтобы они шли в отдельную группу: создайте в Телеграме группу с названием <b>«Оплаты сервисов»</b> и добавьте в неё бота сайта — он сам её подключит.</>}
          {!data.bot && <b className="block text-red-700 dark:text-red-300">Телеграм-бот на сервере не настроен — напоминания не отправляются.</b>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy === 'test' || !data.bot} onClick={() => void run('test', paidApi.test, 'Список отправлен в Телеграм')}>
            <Send className="mr-1 h-4 w-4" />Проверить: прислать список в Телеграм
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Активных: <b>{active.length}</b>{data.monthly.length > 0 && <> · в месяц примерно <b>{data.monthly.join(' + ')}</b></>}
          {data.cert && <> · сертификат сайта ещё <b>{data.cert.days} дн.</b></>}
        </p>
        <Button size="sm" onClick={() => startEdit()}><Plus className="mr-1 h-4 w-4" />Добавить сервис</Button>
      </div>
      {noDate > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status">У {noDate} {noDate % 10 === 1 && noDate % 100 !== 11 ? 'сервиса' : 'сервисов'} не указана дата оплаты — без неё бот не сможет напомнить. Нажмите ✏️ и укажите дату и сумму.</p>}

      {edit && (
        <form className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900" onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid="paid-form">
          <p className="font-semibold">{edit.id ? 'Изменить сервис' : 'Новый сервис'}</p>
          <label className="block text-sm">Название
            <Input value={edit.value.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="Например: Hoster.kz — сервер" required />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">Сумма
              <Input inputMode="decimal" value={edit.value.amount || ''} onChange={(e) => set({ amount: Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0 })} placeholder="9600" />
            </label>
            <label className="block text-sm">Валюта
              <select className={field} value={edit.value.currency} onChange={(e) => set({ currency: e.target.value as PaidServiceInput['currency'] })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-sm">Как часто
              <select className={field} value={edit.value.period} onChange={(e) => set({ period: e.target.value as PaidServiceInput['period'] })}>
                {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Следующая оплата
              <input type="date" className={field} value={edit.value.due_date} onChange={(e) => set({ due_date: e.target.value })} />
            </label>
            <label className="block text-sm">Ссылка на оплату
              <Input type="url" value={edit.value.pay_url} maxLength={500} onChange={(e) => set({ pay_url: e.target.value.trim() })} placeholder="https://…" />
            </label>
          </div>
          <label className="block text-sm">Заметка
            <Input value={edit.value.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} placeholder="Карта, логин в кабинет, что входит" />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.value.active} onChange={(e) => set({ active: e.target.checked })} />Напоминать (снимите, если сервис больше не нужен)</label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy === 'save'}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}</Button>
            <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Отмена</Button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {data.items.map((s) => {
          const due = dueLabel(s.days_left);
          return (
            <li key={s.id} className={`rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 ${s.active ? '' : 'opacity-60'}`} data-testid="paid-row">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{s.name}{!s.active && <span className="ml-2 text-xs font-normal text-gray-500">не напоминать</span>}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{s.price || 'сумма не указана'} · {PERIODS[s.period].toLowerCase()}{s.due_date && <> · {ruDate(s.due_date)}</>}</p>
                  {s.note && <p className="mt-1 text-sm text-gray-500">{s.note}</p>}
                </div>
                {s.active && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONES[due.tone]}`}>{due.text}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {s.active && s.due_date && <Button size="sm" disabled={busy === `p${s.id}`} onClick={() => void run(`p${s.id}`, () => paidApi.paid(s.id), 'Отмечено')}>✅ Оплачено</Button>}
                {s.pay_url && <Button size="sm" variant="outline" asChild><a href={s.pay_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-4 w-4" />Оплатить</a></Button>}
                <Button size="sm" variant="ghost" aria-label={`Изменить ${s.name}`} onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Удалить ${s.name}`} disabled={busy === `d${s.id}`}
                  onClick={() => { if (window.confirm(`Удалить «${s.name}» из списка?`)) void run(`d${s.id}`, () => paidApi.remove(s.id), 'Удалено'); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>
          );
        })}
      </ul>

      {data.log.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-2 font-semibold">Последние оплаты</p>
          <ul className="space-y-1 text-gray-700 dark:text-gray-300">
            {data.log.map((l, i) => <li key={i}>{new Date(l.paid_at).toLocaleDateString('ru-RU')} — {l.name}{l.price && ` · ${l.price}`}{l.paid_by && ` · отметил: ${l.paid_by}`}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
