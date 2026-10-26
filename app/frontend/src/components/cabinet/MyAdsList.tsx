/**
 * «Мои объявления» in the personal cabinet: the same look as the public ads (photo, price, kind),
 * a clear status and the main actions in one row; rare actions are under «Ещё».
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdStatsPanel from '@/components/cabinet/AdStatsPanel';
import { BadgeCheck, BarChart3, ChevronDown, Eye, Heart, Megaphone, MoreHorizontal, Pencil, Phone, RefreshCw, Rocket, Trash2, EyeOff } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { formatAdPrice, kindOf } from '@/lib/adKinds';
import { isAnnouncementExpired, isAnnouncementPromoted } from '@/lib/announcements';
import { getPublicLocale } from '@/i18n/publicLocale';

type Ad = Record<string, any>;

interface Props {
  items: Ad[];
  busy: boolean;
  kz: boolean;
  onBoost: (id: number) => void;
  onUnpublish: (id: number) => void;
  onExtend: (id: number) => void;
  onDelete: (id: number) => void;
}

function closeMenu(e: React.MouseEvent<HTMLElement>) {
  const menu = e.currentTarget.closest('details');
  if (menu) menu.open = false;
}

function shortDate(raw?: string | null) {
  if (!raw || Number.isNaN(new Date(raw).getTime())) return '';
  try { return new Date(raw).toLocaleDateString(getPublicLocale(), { day: 'numeric', month: 'long' }); } catch { return ''; }
}

export function adState(a: Ad): { key: 'live' | 'pending' | 'rejected' | 'hidden' | 'expired'; ru: string; kz: string; cls: string } {
  const published = ['approved', 'published'].includes(a.status);
  if (published && isAnnouncementExpired(a)) return { key: 'expired', ru: 'Срок истёк', kz: 'Мерзімі өтті', cls: 'bg-gray-100 text-gray-600 dark:bg-slate-700/60 dark:text-slate-300' };
  if (published && a.active !== false) return { key: 'live', ru: 'Опубликовано', kz: 'Жарияланды', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' };
  if (a.status === 'pending') return { key: 'pending', ru: 'На проверке', kz: 'Тексерілуде', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' };
  if (a.status === 'rejected') return { key: 'rejected', ru: 'Отклонено', kz: 'Қабылданбады', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' };
  return { key: 'hidden', ru: 'Снято с публикации', kz: 'Жарияланымнан алынды', cls: 'bg-gray-100 text-gray-600 dark:bg-slate-700/60 dark:text-slate-300' };
}

export default function MyAdsList({ items, busy, kz, onBoost, onUnpublish, onExtend, onDelete }: Props) {
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) {
    return (
      <div className="rounded-2xl bg-gray-50 px-6 py-10 text-center dark:bg-[#0f172a]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-sm dark:bg-[#111827]">📢</span>
        <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">{tx('У вас пока нет объявлений', 'Сізде әзірге хабарландыру жоқ')}</p>
        <p className="mt-1 text-xs text-gray-400">{tx('Продайте ненужное, найдите работу или мастера — это бесплатно', 'Керексізді сатыңыз, жұмыс не шебер табыңыз — тегін')}</p>
        <Link to="/announcements/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white"><Megaphone className="h-4 w-4" />{tx('Подать объявление', 'Хабарландыру беру')}</Link>
      </div>
    );
  }
  return (
    <>
    <Link to="/announcements/official" data-testid="cabinet-official" className="mb-3 flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm dark:border-sky-900/60 dark:bg-sky-950/40">
      <BadgeCheck className="h-5 w-5 shrink-0 text-sky-600" />
      <span className="flex-1 text-gray-700 dark:text-slate-200"><b className="text-gray-900 dark:text-white">Sortirovka Official</b> · {tx('покажите объявление 30 000 жителям; здесь же статус заявок', 'хабарландыруды 30 000 тұрғынға көрсетіңіз')}</span>
    </Link>
    <ul className="space-y-3">
      {items.map((a) => {
        const id = Number(a.id);
        const st = adState(a);
        const kind = kindOf(a);
        const price = formatAdPrice(a.price);
        const promoted = isAnnouncementPromoted(a);
        const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold disabled:opacity-50';
        return (
          <li key={a.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-[#26324a] dark:bg-[#111827]" data-testid="my-ad">
            <Link to={`/announcements/${a.id}`} className="flex gap-3">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-50 text-3xl dark:bg-slate-800">
                {a.image_url ? <StorageImg objectKey={a.image_url} alt="" className="h-full w-full object-cover" /> : (kind?.emoji || '📢')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{tx(st.ru, st.kz)}</span>
                  {promoted ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{a.promotion_tier === 'vip' ? 'VIP' : tx('Поднято', 'Көтерілді')}</span> : null}
                  {kind ? <span className="text-[11px] text-gray-400">{kind.emoji} {tx(kind.title.ru, kind.title.kz)}</span> : null}
                </span>
                <span className="mt-1 block line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900 dark:text-white">{a.title || tx('Без названия', 'Атаусыз')}</span>
                {price ? <span className="mt-0.5 block text-[15px] font-bold text-gray-900 dark:text-white">{price}</span> : null}
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400">
                  {st.key === 'live' && a.expires_at ? <span>{tx('до', '')} {shortDate(a.expires_at)}{kz ? ' дейін' : ''}</span> : null}
                  {st.key === 'pending' ? <span>{tx('Обычно до 1 часа', 'Әдетте 1 сағатқа дейін')}</span> : null}
                </span>
              </span>
            </Link>
            <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} data-testid="ad-stats-toggle"
              className="mt-3 flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left text-sm text-gray-700 dark:bg-[#0f172a] dark:text-slate-200">
              <span className="inline-flex items-center gap-1" title={tx('Открыли', 'Ашқандар')}><Eye className="h-4 w-4 text-gray-400" /><b>{Number(a.stats?.people ?? a.views_count ?? 0)}</b></span>
              <span className="inline-flex items-center gap-1" title={tx('Сохранили', 'Сақтағандар')}><Heart className="h-4 w-4 text-rose-400" /><b>{Number(a.stats?.saves ?? 0)}</b></span>
              <span className="inline-flex items-center gap-1" title={tx('Связались', 'Хабарласқандар')}><Phone className="h-4 w-4 text-emerald-500" /><b>{Number(a.stats?.contacts ?? 0)}</b></span>
              <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-amber-700 dark:text-amber-300"><BarChart3 className="h-4 w-4" />{tx('Статистика', 'Статистика')}<ChevronDown className={`h-4 w-4 transition ${open === id ? 'rotate-180' : ''}`} /></span>
            </button>
            {open === id ? <div className="mt-3"><AdStatsPanel id={id} kz={kz} hasPhoto={Boolean(a.image_url)} live={st.key === 'live'} /></div> : null}
            <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-[#26324a]">
              <Link to={`/announcements/${a.id}/edit`} className={`${btn} flex-1 bg-gray-100 text-gray-800 dark:bg-[#1a2336] dark:text-slate-100`}><Pencil className="h-4 w-4" />{tx('Изменить', 'Өзгерту')}</Link>
              {st.key === 'expired' || st.key === 'hidden' ? (
                <button type="button" disabled={busy} onClick={() => onExtend(id)} className={`${btn} flex-1 bg-emerald-600 text-white`}><RefreshCw className="h-4 w-4" />{st.key === 'hidden' ? tx('Разместить', 'Жариялау') : tx('Продлить', 'Ұзарту')}</button>
              ) : st.key === 'live' ? (
                <button type="button" disabled={busy || promoted} onClick={() => onBoost(id)} className={`${btn} flex-1 bg-amber-500 text-white`}><Rocket className="h-4 w-4" />{promoted ? tx('Уже поднято', 'Көтерілген') : tx('Поднять', 'Көтеру')}</button>
              ) : null}
              <details className="relative">
                <summary aria-label={tx('Ещё действия', 'Басқа әрекеттер')} className={`${btn} cursor-pointer list-none bg-gray-100 px-2.5 text-gray-700 dark:bg-[#1a2336] dark:text-slate-200 [&::-webkit-details-marker]:hidden`}><MoreHorizontal className="h-4 w-4" /></summary>
                <div className="absolute bottom-full right-0 z-20 mb-2 w-52 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1 shadow-xl dark:border-[#26324a] dark:bg-[#111827]">
                  {st.key === 'live' ? <button type="button" disabled={busy} onClick={(e) => { closeMenu(e); onExtend(id); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-[#1a2336]"><RefreshCw className="h-4 w-4 text-emerald-600" />{tx('Продлить срок', 'Мерзімін ұзарту')}</button> : null}
                  {st.key === 'live' ? <button type="button" disabled={busy} onClick={(e) => { closeMenu(e); onUnpublish(id); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-[#1a2336]"><EyeOff className="h-4 w-4 text-gray-500" />{tx('Снять с публикации', 'Жарияланымнан алу')}</button> : null}
                  <Link to={`/announcements/official?ad=${id}`} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-[#1a2336]"><BadgeCheck className="h-4 w-4 text-sky-600" />{tx('В Sortirovka Official', 'Sortirovka Official-ға')}</Link>
                  <button type="button" disabled={busy} onClick={(e) => { closeMenu(e); onDelete(id); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" />{tx('Удалить', 'Жою')}</button>
                </div>
              </details>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}
