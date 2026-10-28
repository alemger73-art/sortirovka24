/** Admin: «Мой дом» — receipts to check, houses and residents (назначить старшего), hidden posts and comments. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Crown, Home, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { kindInfo, nbApi, type NbAdmin } from '@/lib/neighbors';

type Member = Awaited<ReturnType<typeof nbApi.adminHouse>>['items'][number];

export default function AdminNeighbors() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NbAdmin | null>(null);
  const [proofs, setProofs] = useState<Record<number, string>>({});
  const [house, setHouse] = useState<{ building: string; title: string; items: Member[] } | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => nbApi.admin().then(setData).catch((e) => toast.error(e?.message || 'Не удалось загрузить «Мой дом»'));
  useEffect(() => { if (open && !data) void load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try { const r = await fn(); toast.success(ok || (r as { answer?: string })?.answer || 'Готово'); await load(); }
    catch (e: any) { toast.error(e?.message || 'Не получилось'); } finally { setBusy(''); }
  }
  async function showProof(id: number) {
    try { const r = await nbApi.adminProof(id); setProofs((p) => ({ ...p, [id]: r.image })); } catch (e: any) { toast.error(e?.message || 'Фото не загрузилось'); }
  }
  async function openHouse(building: string, title: string) {
    try { setHouse({ building, title, items: (await nbApi.adminHouse(building)).items }); } catch (e: any) { toast.error(e?.message || 'Не загрузилось'); }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/30" data-testid="admin-neighbors">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 p-4 text-left">
        <Home className="h-5 w-5 text-indigo-600" />
        <span className="flex-1 font-semibold text-gray-900 dark:text-gray-100">Мой дом — соседи{data?.stats.pending ? ` · ждут: ${data.waiting.length}` : ''}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-5 border-t border-indigo-200 p-4 text-sm dark:border-indigo-900">
          {!data ? <Loader2 className="h-5 w-5 animate-spin" /> : <>
            <p className="text-gray-700 dark:text-gray-300">Подтверждено жителей: <b>{data.stats.neighbours}</b> · домов: <b>{data.stats.houses}</b> · ждут подтверждения: <b>{data.stats.pending}</b></p>

            <section>
              <p className="mb-2 font-semibold">Квитанции на проверку</p>
              {!data.waiting.length ? <p className="text-gray-500">Нет. Новые квитанции также приходят в Telegram с кнопками.</p> : (
                <ul className="space-y-2">
                  {data.waiting.map((w) => (
                    <li key={w.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <p><b>№{w.id}</b> ул. {w.street}, {w.house}{w.kind === 'flat' ? `, подъезд ${w.entrance}, кв. ${w.flat}` : ' (частный)'} · {w.display_name}{w.custom_street ? ' · ⚠️ улицы нет в списке' : ''}</p>
                      {proofs[w.id] ? <img src={proofs[w.id]} alt="Квитанция" className="mt-2 max-h-80 rounded border" /> : <button type="button" className="mt-1 text-indigo-700 underline" onClick={() => void showProof(w.id)}>Показать фото</button>}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" disabled={busy === `a${w.id}`} onClick={() => void run(`a${w.id}`, () => nbApi.adminDecide(w.id, true))}>✅ Подтвердить</Button>
                        <Button size="sm" variant="ghost" disabled={busy === `r${w.id}`} onClick={() => void run(`r${w.id}`, () => nbApi.adminDecide(w.id, false))}>❌ Не совпадает</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="mb-2 font-semibold">Скрыто по жалобам</p>
              {!data.hidden_posts.length && !data.hidden_comments.length ? <p className="text-gray-500">Нет.</p> : (
                <ul className="space-y-2">
                  {data.hidden_posts.map((p) => (
                    <li key={`p${p.id}`} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <p className="text-xs text-gray-500">Запись №{p.id} · {kindInfo(p.kind).title.ru} · жалоб: {p.reports}</p>
                      <p className="mt-1 whitespace-pre-line">{p.body}</p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void run(`p${p.id}`, () => nbApi.adminModerate('post', p.id, true), 'Вернули')}>Вернуть</Button>
                        <Button size="sm" variant="ghost" onClick={() => void run(`p${p.id}`, () => nbApi.adminModerate('post', p.id, false), 'Удалено')}>Удалить</Button>
                      </div>
                    </li>
                  ))}
                  {data.hidden_comments.map((c) => (
                    <li key={`c${c.id}`} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <p className="text-xs text-gray-500">Комментарий №{c.id} к записи №{c.post_id} · жалоб: {c.reports}</p>
                      <p className="mt-1 whitespace-pre-line">{c.body}</p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void run(`c${c.id}`, () => nbApi.adminModerate('comment', c.id, true), 'Вернули')}>Вернуть</Button>
                        <Button size="sm" variant="ghost" onClick={() => void run(`c${c.id}`, () => nbApi.adminModerate('comment', c.id, false), 'Удалено')}>Удалить</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="mb-2 font-semibold">Дома</p>
              {!data.houses.length ? <p className="text-gray-500">Пока никто не подтверждён.</p> : (
                <div className="flex flex-wrap gap-2">
                  {data.houses.map((h) => <button key={h.building} type="button" onClick={() => void openHouse(h.building, h.title)}
                    className={`rounded-full border px-3 py-1 ${house?.building === h.building ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900' : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>{h.title} · {h.people}</button>)}
                </div>
              )}
              {house && (
                <ul className="mt-3 divide-y rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
                  {house.items.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 p-2">
                      <span className="flex-1">{m.display_name}{m.anonymous ? ' (скрыл имя)' : ''} · {m.entrance ? `подъезд ${m.entrance}, кв. ${m.flat}` : 'частный'} · {m.status === 'confirmed' ? 'подтверждён' : 'ждёт'}</span>
                      {m.status === 'confirmed' && (m.role === 'elder'
                        ? <Button size="sm" variant="ghost" onClick={() => void run(`e${m.id}`, () => nbApi.adminRole(m.id, 'member'), 'Снят').then(() => openHouse(house.building, house.title))}><Crown className="mr-1 h-4 w-4 text-amber-500" />Снять старшего</Button>
                        : <Button size="sm" variant="outline" onClick={() => void run(`e${m.id}`, () => nbApi.adminRole(m.id, 'elder'), 'Назначен старшим').then(() => openHouse(house.building, house.title))}>Сделать старшим</Button>)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>}
        </div>
      )}
    </div>
  );
}
