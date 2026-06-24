import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { accountApi, getAccountToken, type SavedAddress } from '@/lib/accountApi';

type Accent = 'emerald' | 'teal' | 'amber' | 'orange' | 'violet';

const ACCENTS: Record<Accent, { active: string; idle: string; badge: string; icon: string; link: string }> = {
  emerald: {
    active: 'border-emerald-500 bg-emerald-50 text-emerald-800',
    idle: 'border-gray-200 bg-gray-50 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50',
    badge: 'bg-emerald-500/15 text-emerald-700',
    icon: 'text-emerald-600',
    link: 'text-emerald-700 hover:text-emerald-800',
  },
  teal: {
    active: 'border-teal-500 bg-teal-50 text-teal-800',
    idle: 'border-gray-200 bg-gray-50 text-gray-700 hover:border-teal-300 hover:bg-teal-50/50',
    badge: 'bg-teal-500/15 text-teal-700',
    icon: 'text-teal-600',
    link: 'text-teal-700 hover:text-teal-800',
  },
  amber: {
    active: 'border-amber-500 bg-amber-50 text-amber-800',
    idle: 'border-gray-200 bg-gray-50 text-gray-700 hover:border-amber-300 hover:bg-amber-50/50',
    badge: 'bg-amber-500/15 text-amber-700',
    icon: 'text-amber-600',
    link: 'text-amber-700 hover:text-amber-800',
  },
  orange: {
    active: 'border-orange-500 bg-orange-50 text-orange-800',
    idle: 'border-gray-200 bg-gray-50 text-gray-700 hover:border-orange-300 hover:bg-orange-50/50',
    badge: 'bg-orange-500/15 text-orange-700',
    icon: 'text-orange-600',
    link: 'text-orange-700 hover:text-orange-800',
  },
  violet: {
    active: 'border-violet-500 bg-violet-50 text-violet-800',
    idle: 'border-gray-200 bg-gray-50 text-gray-700 hover:border-violet-300 hover:bg-violet-50/50',
    badge: 'bg-violet-500/15 text-violet-700',
    icon: 'text-violet-600',
    link: 'text-violet-700 hover:text-violet-800',
  },
};

interface Props {
  currentAddress: string;
  onSelect: (saved: SavedAddress, opts?: { auto?: boolean }) => void;
  accent?: Accent;
  /** Auto-apply the default address once if the field is still empty. */
  autoApplyDefault?: boolean;
}

/**
 * Quick selector of delivery addresses saved in the personal cabinet.
 * Self-loads the list for authenticated users and renders nothing otherwise.
 */
export default function SavedAddressBar({ currentAddress, onSelect, accent = 'emerald', autoApplyDefault = true }: Props) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const autoApplied = useRef(false);
  const c = ACCENTS[accent];

  useEffect(() => {
    if (!getAccountToken()) return;
    let active = true;
    accountApi
      .listAddresses()
      .then((list) => {
        if (!active) return;
        setAddresses(list);
        if (autoApplyDefault && !autoApplied.current && !currentAddress.trim()) {
          autoApplied.current = true;
          const preferred = list.find((a) => a.is_default) || list[0];
          if (preferred) onSelect(preferred, { auto: true });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (addresses.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <MapPin className={`h-4 w-4 ${c.icon}`} />
        Мои адреса
      </p>
      <p className="mt-0.5 text-xs text-gray-500">Выберите, куда доставить</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {addresses.map((sa) => {
          const isActive = currentAddress.trim() === sa.address.trim();
          return (
            <button
              key={sa.id}
              type="button"
              onClick={() => onSelect(sa)}
              className={`max-w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${isActive ? c.active : c.idle}`}
            >
              <span className="flex items-center gap-1.5">
                {sa.label ? <span className="font-semibold">{sa.label}</span> : null}
                {sa.is_default ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.badge}`}>по умолчанию</span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-gray-500">{sa.address}</span>
            </button>
          );
        })}
      </div>
      <Link to="/cabinet?tab=addresses" className={`mt-3 inline-block text-xs font-semibold ${c.link}`}>
        Управлять адресами →
      </Link>
    </div>
  );
}
