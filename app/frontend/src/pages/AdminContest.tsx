/** Admin: «Новогодняя Сортировка» contest — dates and prizes, checking entries, votes and winners. */
import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Phone, Save, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { contestApi, photoUrl, type AdminEntry, type AdminView, type EntryStatus } from '@/lib/contest';

const PHASES: Record<AdminView['phase'], string> = {
  off: 'выключен', soon: 'ещё не начался', apply: 'идёт приём заявок', wait: 'заявки закрыты, голосование скоро',
  vote: 'идёт голосование', results: 'голосование закончено — отметьте победителей',
};
const STATUS: Record<EntryStatus, string> = { pending: 'Ждёт проверки', published: 'Опубликована', rejected: 'Возвращена' };
const NOMS = { yard: 'Двор', house: 'Дом' } as const;
const DATES = [
  { key: 'apply_from', label: 'Заявки с' }, { key: 'apply_to', label: 'Заявки по' },
  { key: 'vote_from', label: 'Голосование с' }, { key: 'vote_to', label: 'Голосование по' },
] as const;

function EntryRow({ e, onChange }: { e: AdminEntry; onChange: (body: Parameters<typeof contestApi.admin.entry>[1]) => Promise<void> }) {
  const [reason, setReason] = useState('');
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{e.title} <span className="text-sm font-normal text-gray-500">· {NOMS[e.nomination]} · {e.street}</span></p>
          <p className="text-sm text-gray-500">{e.user_name || 'Без имени'} · <a className="inline-flex items-center gap-1 text-blue-700" href={`tel:${e.user_phone}`}><Phone className="h-3 w-3" />{e.user_phone}</a></p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{STATUS[e.status]} · голосов {e.votes}{e.place ? ` · ${e.place} место` : ''}</span>
      </div>
      {e.about && <p className="mt-2 text-sm text-gray-700">{e.about}</p>}
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {e.photos.map((p) => <a key={p} href={photoUrl(p)} target="_blank" rel="noopener"><img src={photoUrl(p)} alt="" className="h-24 w-32 shrink-0 rounded-lg object-cover" /></a>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {e.status !== 'published' && <Button size="sm" onClick={() => void onChange({ status: 'published' })}><Check className="mr-1 h-4 w-4" />Опубликовать</Button>}
        {e.status !== 'rejected' && (
          <>
            <Input className="h-9 w-56" placeholder="Причина (видна участнику)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
            <Button size="sm" variant="outline" onClick={() => void onChange({ status: 'rejected', reason })}><X className="mr-1 h-4 w-4" />Вернуть</Button>
          </>
        )}
        {e.status === 'published' && (
          <span className="ml-auto flex items-center gap-1">
            <Trophy className="h-4 w-4 text-amber-500" />
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => void onChange(e.place === n ? { clear_place: true } : { place: n })}
                className={`rounded-lg border px-2.5 py-1 text-sm ${e.place === n ? 'border-amber-500 bg-amber-50 font-bold text-amber-800' : 'border-gray-300 text-gray-700'}`}>
                {n}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminContest() {
  const [view, setView] = useState<AdminView | null>(null);
  const [form, setForm] = useState<AdminView['settings'] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = await contestApi.admin.view();
      setView(v); setForm(v.settings);
    } catch (e) {
      toast.error(String((e as Error)?.message || 'Не удалось загрузить конкурс'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!view || !form) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;

  async function save() {
    if (!form) return;
    setSaving(true);
    try { await contestApi.admin.settings(form); toast.success('Сохранено'); await load(); }
    catch (e) { toast.error(String((e as Error)?.message || 'Не удалось сохранить')); }
    finally { setSaving(false); }
  }
  async function change(id: number, body: Parameters<typeof contestApi.admin.entry>[1]) {
    try { await contestApi.admin.entry(id, body); await load(); }
    catch (e) { toast.error(String((e as Error)?.message || 'Не получилось')); }
  }

  const pending = view.entries.filter((e) => e.status === 'pending');
  const rest = view.entries.filter((e) => e.status !== 'pending').sort((a, b) => b.votes - a.votes);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /><h2 className="text-lg font-bold text-gray-900">Конкурс «Новогодняя Сортировка»</h2></div>
        <p className="text-sm text-gray-500">Сейчас: <b>{PHASES[view.phase]}</b>. Заявок: {view.entries.length}, ждут проверки: {pending.length}.</p>
        <a href="/konkurs" target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"><ExternalLink className="h-4 w-4" />Открыть страницу конкурса</a>
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /><span className="font-medium text-gray-900">Конкурс включён</span></label>
        <div className="grid gap-3 sm:grid-cols-2">
          {DATES.map((d) => (
            <label key={d.key} className="text-sm"><span className="mb-1 block font-medium text-gray-900">{d.label}</span>
              <Input type="date" value={form[d.key]} onChange={(e) => setForm({ ...form, [d.key]: e.target.value })} /></label>
          ))}
        </div>
        <label className="block text-sm"><span className="mb-1 block font-medium text-gray-900">Подарки (RU)</span>
          <textarea className="w-full rounded-md border border-gray-300 p-2 text-sm" rows={2} maxLength={600} value={form.prizes_ru} onChange={(e) => setForm({ ...form, prizes_ru: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-gray-900">Подарки (KZ)</span>
          <textarea className="w-full rounded-md border border-gray-300 p-2 text-sm" rows={2} maxLength={600} value={form.prizes_kz} onChange={(e) => setForm({ ...form, prizes_kz: e.target.value })} /></label>
        <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Сохранить</Button>
      </div>

      {pending.length > 0 && <h3 className="font-bold text-gray-900">Ждут проверки</h3>}
      {pending.map((e) => <EntryRow key={e.id} e={e} onChange={(b) => change(e.id, b)} />)}
      {rest.length > 0 && <h3 className="font-bold text-gray-900">Участники (по голосам)</h3>}
      {rest.map((e) => <EntryRow key={e.id} e={e} onChange={(b) => change(e.id, b)} />)}
      {view.entries.length === 0 && <p className="text-sm text-gray-500">Заявок пока нет.</p>}
    </div>
  );
}
