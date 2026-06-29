import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  clearPlatformCartSegment,
  getPlatformCartSegments,
  PLATFORM_CART_CHANGED_EVENT,
  platformCartTotalCount,
} from '@/lib/platformCart';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PlatformCartDrawer({ open, onClose }: Props) {
  const [segments, setSegments] = useState(getPlatformCartSegments());

  useEffect(() => {
    if (!open) return;
    setSegments(getPlatformCartSegments());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setSegments(getPlatformCartSegments());
    window.addEventListener('storage', refresh);
    window.addEventListener(PLATFORM_CART_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PLATFORM_CART_CHANGED_EVENT, refresh);
    };
  }, [open]);

  function handleClear(segId: string, label: string) {
    if (!window.confirm(`Очистить корзину «${label}»? Все товары будут удалены.`)) return;
    clearPlatformCartSegment(segId);
    setSegments(getPlatformCartSegments());
    toast.success(`Корзина «${label}» очищена`);
  }

  if (!open) return null;

  const total = platformCartTotalCount(segments);

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Закрыть" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-950 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-blue-600" />
            <h2 className="font-bold text-lg">Мои корзины</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {segments.length === 0 ? (
            <p className="text-center text-gray-500 py-12">Корзины пусты</p>
          ) : (
            segments.map((seg) => (
              <div
                key={seg.id}
                className="flex items-center gap-2 rounded-2xl border p-4 dark:border-gray-800"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`h-10 w-10 shrink-0 rounded-xl ${seg.accent} text-white flex items-center justify-center text-sm font-bold`}>
                    {seg.count}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{seg.label}</p>
                    <p className="text-xs text-gray-500">{seg.count} {seg.count === 1 ? 'товар' : seg.count < 5 ? 'товара' : 'товаров'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleClear(seg.id, seg.label)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    aria-label={`Очистить корзину ${seg.label}`}
                    title="Очистить корзину"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <Link
                    to={seg.path}
                    onClick={onClose}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  >
                    Оформить →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {total > 0 && (
          <div className="border-t p-4 text-sm text-gray-500 dark:border-gray-800">
            Всего позиций: <span className="font-bold text-gray-900 dark:text-white">{total}</span>
            <p className="text-xs mt-1">Каждый магазин оформляется отдельно — своя доставка и оплата.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PlatformCartButton({ onClick }: { onClick: () => void }) {
  const [count, setCount] = useState(platformCartTotalCount());

  useEffect(() => {
    const refresh = () => setCount(platformCartTotalCount());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(PLATFORM_CART_CHANGED_EVENT, refresh);
    const id = window.setInterval(refresh, 2000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PLATFORM_CART_CHANGED_EVENT, refresh);
      window.clearInterval(id);
    };
  }, []);

  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
      title="Мои корзины"
    >
      <ShoppingBag className="h-4 w-4" />
      <span className="hidden sm:inline">Корзины</span>
      <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
        {count > 99 ? '99+' : count}
      </span>
    </button>
  );
}
