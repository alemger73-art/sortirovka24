import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Plus, ShoppingCart, ClipboardList,
  CheckCircle2, Truck, Store, Banknote, Smartphone, MapPin, X,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const STORAGE_KEY = 'damalem_howto_hidden';

interface DamAlemOrderGuideProps {
  deliveryZones?: { name: string; price: number }[];
  minOrder?: number;
  formatPrice?: (n: number) => string;
}

export default function DamAlemOrderGuide({
  deliveryZones = [],
  minOrder = 0,
  formatPrice = (n) => `${n.toLocaleString('ru-RU')} ₸`,
}: DamAlemOrderGuideProps) {
  const { t } = useLanguage();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(true);

  if (hidden) return null;

  const steps = [
    {
      icon: Plus,
      title: t('food.guide.step1Title'),
      desc: t('food.guide.step1Desc'),
    },
    {
      icon: ShoppingCart,
      title: t('food.guide.step2Title'),
      desc: t('food.guide.step2Desc'),
    },
    {
      icon: ClipboardList,
      title: t('food.guide.step3Title'),
      desc: t('food.guide.step3Desc'),
    },
    {
      icon: CheckCircle2,
      title: t('food.guide.step4Title'),
      desc: t('food.guide.step4Desc'),
    },
  ];

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  return (
    <section className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#FF3B30]">{t('food.guide.badge')}</p>
          <h2 className="text-base font-extrabold text-[#111111]">{t('food.guide.title')}</h2>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600"
            aria-label={expanded ? 'Свернуть' : 'Развернуть'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500"
            aria-label="Скрыть подсказку"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {steps.map(({ icon: Icon, title, desc }, idx) => (
              <div key={title} className="rounded-xl bg-[#FAFAFA] p-3 ring-1 ring-gray-100">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FF3B30] text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <Icon className="h-4 w-4 text-[#FF3B30]" />
                </div>
                <p className="text-xs font-bold text-[#111111] leading-snug">{title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#777777]">{desc}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
            {[
              { icon: Truck, label: t('food.guide.iconDelivery'), sub: t('food.guide.iconDeliverySub') },
              { icon: Store, label: t('food.guide.iconPickup'), sub: t('food.guide.iconPickupSub') },
              { icon: Banknote, label: t('food.guide.iconPay'), sub: t('food.guide.iconPaySub') },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="text-center px-1">
                <Icon className="mx-auto h-5 w-5 text-[#FF3B30]" />
                <p className="mt-1 text-[10px] font-bold text-[#111111] leading-tight">{label}</p>
                <p className="text-[9px] text-[#999999] leading-tight">{sub}</p>
              </div>
            ))}
          </div>

          {deliveryZones.length > 0 && (
            <div className="rounded-xl bg-red-50/60 p-3 ring-1 ring-red-100">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[#111111]">
                <MapPin className="h-3.5 w-3.5 text-[#FF3B30]" />
                {t('food.guide.zonesTitle')}
              </p>
              <p className="mt-1 text-[11px] text-[#666666] leading-relaxed">{t('food.guide.zonesHint')}</p>
              <ul className="mt-2 space-y-1">
                {deliveryZones.map(z => (
                  <li key={z.name} className="flex justify-between text-[11px] text-[#444444]">
                    <span>{z.name}</span>
                    <span className="font-semibold text-[#FF3B30]">+{formatPrice(z.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {minOrder > 0 && (
            <p className="text-[11px] text-center text-[#999999]">
              {t('food.minOrder')}: <span className="font-semibold text-[#111111]">{formatPrice(minOrder)}</span>
            </p>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-2.5 text-[11px] text-[#666666]">
            <Smartphone className="h-4 w-4 shrink-0 text-[#FF3B30] mt-0.5" />
            <p className="leading-relaxed">{t('food.guide.paymentNote')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
