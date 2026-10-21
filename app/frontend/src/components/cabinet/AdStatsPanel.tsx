/**
 * Owner's statistics for one ad: how many people saw it in the list, opened it, saved it,
 * called or wrote — with a 14-day chart and a plain-language tip on what to improve.
 */
import { useEffect, useState } from 'react';
import { Loader2, Phone, MessageCircle, Share2, Heart, Eye, LayoutList, Users } from 'lucide-react';
import { accountApi } from '@/lib/accountApi';
import { getPublicLocale } from '@/i18n/publicLocale';

type Stats = {
  totals: { impression: number; view: number; phone: number; whatsapp: number; share: number; people: number; contacted: number; saves: number };
  days: { day: string; views: number; contacts: number; impressions: number }[];
  since?: string | null;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function AdStatsPanel({ id, kz, hasPhoto, live }: { id: number; kz: boolean; hasPhoto: boolean; live: boolean }) {
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const [data, setData] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    accountApi.myAnnouncementStats(id).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id]);

  if (failed) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{tx('Статистика сейчас недоступна, попробуйте позже.', 'Статистика қазір қолжетімсіз, кейінірек көріңіз.')}</p>;
  if (!data) return <div className="flex justify-center py-6 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const t = data.totals;
  const max = Math.max(1, ...data.days.map((d) => d.views));
  const tiles = [
    { icon: LayoutList, label: tx('Показы в ленте', 'Лентадағы көрсетілім'), value: t.impression, tone: 'text-sky-600 bg-sky-50 dark:bg-sky-500/10' },
    { icon: Users, label: tx('Открыли', 'Ашқандар'), value: t.people, tone: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10' },
    { icon: Heart, label: tx('Сохранили', 'Сақтағандар'), value: t.saves, tone: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10' },
    { icon: Phone, label: tx('Связались', 'Хабарласқандар'), value: t.contacted, tone: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10' },
  ];
  let tip = '';
  if (!live) tip = tx('Объявление сейчас не показывается — статистика растёт только у опубликованных.', 'Хабарландыру қазір көрсетілмейді — статистика тек жарияланғандарда өседі.');
  else if (t.impression >= 30 && pct(t.people, t.impression) < 5) tip = hasPhoto ? tx('Объявление видят, но редко открывают. Сделайте заголовок понятнее и поставьте лучшее фото первым.', 'Хабарландыруды көреді, бірақ сирек ашады. Тақырыпты түсініктірек етіп, ең жақсы фотоны бірінші қойыңыз.') : tx('Объявление видят, но редко открывают. Добавьте фото — с ним открывают в разы чаще.', 'Хабарландыруды көреді, бірақ сирек ашады. Фото қосыңыз — фотосымен әлдеқайда жиі ашады.');
  else if (t.people >= 15 && t.contacted === 0) tip = tx('Открывают, но не звонят. Проверьте цену и добавьте подробностей в описание.', 'Ашады, бірақ қоңырау шалмайды. Бағаны тексеріп, сипаттамаға толығырақ жазыңыз.');
  else if (t.people > 0 && t.contacted > 0) tip = tx(`Из каждых 100 открывших связываются ${pct(t.contacted, t.people)}. Хороший результат — 5–10.`, `Ашқан әр 100 адамның ${pct(t.contacted, t.people)}-і хабарласады. Жақсы нәтиже — 5–10.`);

  const dayLabel = (d: string) => { try { return new Date(`${d}T12:00:00`).toLocaleDateString(getPublicLocale(), { day: 'numeric', month: 'short' }); } catch { return d; } };

  return (
    <div className="space-y-4" data-testid="ad-stats">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="rounded-xl bg-gray-50 p-3 dark:bg-[#0f172a]">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></span>
            <p className="mt-1.5 text-2xl font-bold leading-none text-gray-900 dark:text-white">{value.toLocaleString('ru-RU')}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-amber-600" />{tx('Звонки', 'Қоңыраулар')}: <b>{t.phone}</b></span>
        <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-4 w-4 text-green-600" />WhatsApp: <b>{t.whatsapp}</b></span>
        <span className="inline-flex items-center gap-1.5"><Share2 className="h-4 w-4 text-sky-600" />{tx('Поделились', 'Бөлісті')}: <b>{t.share}</b></span>
        <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4 text-gray-400" />{tx('Открытий', 'Ашылым')}: <b>{t.view}</b></span>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{tx('Открытия за 14 дней', '14 күндегі ашылым')}</p>
        <div className="flex h-28 items-end gap-1" role="img" aria-label={tx('Открытия по дням', 'Күндер бойынша ашылым')}>
          {data.days.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${dayLabel(d.day)}: ${d.views} ${tx('открытий', 'ашылым')}, ${d.contacts} ${tx('контактов', 'байланыс')}`}>
              <div className="relative w-full overflow-hidden rounded-t bg-amber-300 dark:bg-amber-500/70" style={{ height: `${Math.max(d.views ? 6 : 2, (d.views / max) * 100)}%` }}>
                {d.contacts > 0 && <div className="absolute inset-x-0 bottom-0 bg-emerald-500" style={{ height: `${Math.min(100, (d.contacts / Math.max(1, d.views)) * 100)}%` }} />}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-400"><span>{dayLabel(data.days[0]?.day)}</span><span>{tx('сегодня', 'бүгін')}</span></div>
        <div className="mt-2 flex gap-3 text-[11px] text-gray-500"><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-amber-300" />{tx('открыли', 'ашты')}</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-emerald-500" />{tx('связались', 'хабарласты')}</span></div>
      </div>

      {tip ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">💡 {tip}</p> : null}
      <p className="text-[11px] leading-snug text-gray-400">{tx('Считаем живых людей: один человек за день — один раз. Ваши собственные просмотры и роботы не учитываются.', 'Тірі адамдарды санаймыз: бір адам күніне — бір рет. Өз қаралымыңыз бен роботтар есептелмейді.')}</p>
    </div>
  );
}
