/** A product up close: big photo, size, care hints and the description, with the cart stepper. */
import { useEffect } from 'react';
import { Droplets, Leaf, Minus, Plus, Ruler, Sun, X } from 'lucide-react';
import { LIGHT, WATER, money, type ShopProduct } from '@/lib/partnerShop';

type Props = { product: ShopProduct; accent: string; qty: number; onChange: (delta: number) => void; onClose: () => void; onCart: () => void };

export default function ProductSheet({ product: p, accent, qty, onChange, onClose, onCart }: Props) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const facts = [
    p.height_cm && { icon: Ruler, label: 'Высота', value: `${p.height_cm} см` },
    p.pot_cm && { icon: Ruler, label: 'Горшок', value: `⌀ ${p.pot_cm} см` },
    p.light && { icon: Sun, label: 'Свет', value: LIGHT[p.light] },
    p.water && { icon: Droplets, label: 'Полив', value: WATER[p.water] },
  ].filter(Boolean) as { icon: typeof Sun; label: string; value: string }[];

  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={p.name} onClick={onClose}>
    <div className="shop-sheet max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white dark:bg-gray-950 sm:grid sm:grid-cols-[1fr_1.05fr] sm:overflow-hidden sm:rounded-[28px]" onClick={e => e.stopPropagation()}>
      <div className="relative aspect-square bg-[#eef2ee] dark:bg-gray-900 sm:aspect-auto sm:h-full">
        {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-7xl">🪴</div>}
        <button aria-label="Закрыть" onClick={onClose} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow"><X className="h-5 w-5" /></button>
        {p.easy && <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-900"><Leaf className="h-3.5 w-3.5" style={{ color: accent }} />Неприхотливое</span>}
      </div>
      <div className="flex flex-col p-5 sm:max-h-[86vh] sm:overflow-y-auto sm:p-7">
        <p className="text-sm font-medium" style={{ color: accent }}>{p.category}</p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight">{p.name}</h2>
        <p className="mt-3 text-3xl font-black tracking-tight">{money(p.price)}</p>
        {facts.length > 0 && <dl className="mt-5 grid grid-cols-2 gap-2">
          {facts.map(f => <div key={f.label} className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-900">
            <dt className="flex items-center gap-1.5 text-xs text-gray-500"><f.icon className="h-3.5 w-3.5" />{f.label}</dt>
            <dd className="mt-1 text-sm font-semibold leading-snug">{f.value}</dd>
          </div>)}
        </dl>}
        {p.description && <p className="mt-5 leading-relaxed text-gray-700 dark:text-gray-300">{p.description}</p>}
        <div className="mt-6 flex items-center gap-3 sm:mt-auto sm:pt-6">
          {qty > 0 && <div className="flex items-center rounded-2xl border-2" style={{ borderColor: accent }}>
            <button aria-label={`Убрать ${p.name}`} onClick={() => onChange(-1)} className="flex h-12 w-12 items-center justify-center"><Minus className="h-4 w-4" /></button>
            <span className="w-6 text-center text-lg font-bold" aria-live="polite">{qty}</span>
            <button aria-label={`Добавить ещё ${p.name}`} onClick={() => onChange(1)} className="flex h-12 w-12 items-center justify-center"><Plus className="h-4 w-4" /></button>
          </div>}
          <button onClick={() => qty ? onCart() : onChange(1)} className="min-h-12 flex-1 rounded-2xl px-5 font-bold text-white" style={{ background: accent }}>
            {qty ? 'Перейти в корзину' : `В корзину · ${money(p.price)}`}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
