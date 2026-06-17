import { Link } from 'react-router-dom';
import { X, ExternalLink, Phone, ChevronLeft, type LucideIcon } from 'lucide-react';

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

export default function PharmacySideMenu({
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
        className={`fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className={`fixed top-0 left-0 bottom-0 w-[min(20rem,85vw)] bg-white z-[60] shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Меню аптеки"
        aria-hidden={!open}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 space-y-3">
          <Link
            to="/"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors touch-manipulation"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="flex-1">На главную Сортировка24</span>
            <ExternalLink className="h-4 w-4 shrink-0 opacity-60" />
          </Link>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{storeName || 'АПТЕКА 24'}</p>
              <p className="text-xs text-gray-400">Разделы аптеки</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 shrink-0"
              aria-label="Закрыть меню"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {items.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm transition-colors touch-manipulation ${
                activeId === id
                  ? 'bg-teal-50 text-teal-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${activeId === id ? 'text-teal-600' : 'text-gray-400'}`} />
              <span className="flex-1">{label}</span>
              {badge != null && badge > 0 && (
                <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
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
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 touch-manipulation"
            >
              <Phone className="h-4 w-4 text-teal-600" />
              {storePhone}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
