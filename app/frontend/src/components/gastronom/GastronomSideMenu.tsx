import { Link } from 'react-router-dom';
import { X, Home, ExternalLink, Phone, type LucideIcon } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  storeName?: string;
  storePhone?: string;
}

export default function GastronomSideMenu({
  open,
  onClose,
  items,
  activeId,
  onSelect,
  storeName,
  storePhone,
}: Props) {
  const phoneDigits = storePhone?.replace(/\D/g, '') ?? '';

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className={`fixed top-0 left-0 bottom-0 w-[min(20rem,85vw)] bg-white z-50 shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Меню магазина"
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">{storeName || 'ГАСТРОНОМ'}</p>
            <p className="text-xs text-gray-400">Меню магазина</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200"
            aria-label="Закрыть меню"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {items.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => { onSelect(id); onClose(); }}
              className={`w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm transition-colors ${
                activeId === id
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${activeId === id ? 'text-emerald-600' : 'text-gray-400'}`} />
              <span className="flex-1">{label}</span>
              {badge != null && badge > 0 && (
                <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-2 safe-area-pb">
          {phoneDigits.length >= 10 && (
            <a
              href={`tel:+${phoneDigits}`}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
            >
              <Phone className="h-4 w-4 text-emerald-600" />
              {storePhone}
            </a>
          )}
          <Link
            to="/"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 border border-gray-100"
          >
            <Home className="h-4 w-4" />
            Сортировка24 — главный портал
            <ExternalLink className="h-3.5 w-3.5 ml-auto text-gray-400" />
          </Link>
        </div>
      </div>
    </>
  );
}
