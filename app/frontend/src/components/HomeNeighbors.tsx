/** Home: «Мой дом» card — how many neighbours are already in your house, or an invitation to add it. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAccountToken } from '@/lib/accountApi';
import { nbApi, plural } from '@/lib/neighbors';

type View = { kind: 'guest' } | { kind: 'add' } | { kind: 'house'; title: string; total: number };

export default function HomeNeighbors() {
  const { lang } = useLanguage();
  const say = (ru: string, kz: string) => (lang === 'kz' ? kz : ru);
  const authed = !!getAccountToken();
  const [view, setView] = useState<View | null>(authed ? null : { kind: 'guest' });

  useEffect(() => {
    if (!authed) return;
    let live = true;
    (async () => {
      try {
        const { member } = await nbApi.me();
        if (!member || member.status === 'blocked') return live && setView(member ? null : { kind: 'add' });
        const house = member.status === 'confirmed' ? await nbApi.house().catch(() => null) : null;
        if (live) setView({ kind: 'house', title: member.title, total: house?.total || 1 });
      } catch { if (live) setView({ kind: 'add' }); }
    })();
    return () => { live = false; };
  }, [authed]);

  if (!view) return null;
  const others = view.kind === 'house' ? view.total - 1 : 0;
  const title = view.kind === 'house'
    ? (others > 0
      ? say(`В вашем доме ${view.total} ${plural(view.total, 'сосед', 'соседа', 'соседей')}`, `Үйіңізде ${view.total} көрші`)
      : say('Вы первый в своём доме', 'Сіз үйіңізде біріншісіз'))
    : say('Мой дом — найдите соседей', 'Менің үйім — көршілерді табыңыз');
  const sub = view.kind === 'house'
    ? `${view.title} · ${others > 0 ? say('позовите ещё', 'тағы шақырыңыз') : say('позовите соседей', 'көршілерді шақырыңыз')}`
    : say('Укажите свой дом: аварии, собрания и вопросы соседей', 'Үйіңізді көрсетіңіз: апаттар, жиналыстар, көршілер сұрақтары');

  return (
    <section className="a-section" aria-label={say('Мой дом', 'Менің үйім')}>
      <Link to="/dom" data-testid="home-neighbors" data-state={view.kind}
        className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-4 text-white shadow-md transition hover:shadow-lg active:scale-[.99] md:p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/20"><Building2 size={26} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-base md:text-lg">{title}</b>
          <span className="block truncate text-sm text-white/90">{sub}</span>
        </span>
        <ArrowRight size={22} className="shrink-0" />
      </Link>
    </section>
  );
}
