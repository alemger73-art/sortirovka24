import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Utensils, ShoppingBag, Settings, Image, ExternalLink, ChefHat,
} from 'lucide-react';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import AdminFood from './AdminFood';
import AdminFoodOrders from './AdminFoodOrders';
import AdminFoodSettings from './AdminFoodSettings';
import AdminDamAlemBanners from './AdminDamAlemBanners';

type Section = 'menu' | 'categories' | 'orders' | 'settings' | 'banners';

interface AdminDamAlemProps {
  initialSection?: Section;
}

const TABS: { id: Section; label: string; icon: typeof Utensils }[] = [
  { id: 'menu', label: 'Блюда', icon: ChefHat },
  { id: 'categories', label: 'Категории', icon: Utensils },
  { id: 'orders', label: 'Заказы', icon: ShoppingBag },
  { id: 'banners', label: 'Баннеры', icon: Image },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export default function AdminDamAlem({ initialSection = 'menu' }: AdminDamAlemProps) {
  const [section, setSection] = useState<Section>(initialSection);

  return (
    <div className="space-y-6">
      {/* Brand header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF3B30] via-[#e8352b] to-[#9f1e18] p-5 text-white shadow-lg md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Раздел «Еда»</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">{DAM_ALEM_BRAND}</h2>
            <p className="mt-2 max-w-lg text-sm text-white/85">
              Управление меню, заказами, акциями и настройками доставки. Всё, что видит клиент на странице /food.
            </p>
          </div>
          <Link
            to="/food"
            target="_blank"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
          >
            Открыть витрину <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? 'bg-[#FF3B30] text-white shadow-md shadow-[#FF3B30]/25'
                  : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {(section === 'menu' || section === 'categories') && (
        <AdminFood damAlemMode initialSection={section === 'categories' ? 'categories' : 'items'} />
      )}
      {section === 'orders' && <AdminFoodOrders />}
      {section === 'settings' && <AdminFoodSettings />}
      {section === 'banners' && <AdminDamAlemBanners />}
    </div>
  );
}
