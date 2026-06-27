import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import {

  Utensils, ShoppingBag, Settings, Image, ExternalLink, ChefHat,

  Store, SlidersHorizontal,

} from 'lucide-react';

import { DAM_ALEM_BRAND } from '@/lib/damAlem';

import AdminFood from './AdminFood';

import AdminFoodOrders from './AdminFoodOrders';

import AdminFoodSettings from './AdminFoodSettings';

import AdminDamAlemBanners from './AdminDamAlemBanners';

import AdminDamAlemBrand from './AdminDamAlemBrand';

import AdminDamAlemModifiers from './AdminDamAlemModifiers';
import AdminDamAlemGuide from '@/components/damalem/AdminDamAlemGuide';
import AdminDamAlemPartnerAccess from '@/components/damalem/AdminDamAlemPartnerAccess';



type Section = 'brand' | 'menu' | 'categories' | 'modifiers' | 'orders' | 'settings' | 'banners';



interface AdminDamAlemProps {

  initialSection?: Section;

  /** When true, hides platform-only controls (partner panel at /partner/dam-alem). */
  partnerMode?: boolean;

}



const TABS: { id: Section; label: string; icon: typeof Utensils }[] = [

  { id: 'brand', label: 'Заведение', icon: Store },

  { id: 'menu', label: 'Блюда', icon: ChefHat },

  { id: 'categories', label: 'Категории', icon: Utensils },

  { id: 'modifiers', label: 'Опции', icon: SlidersHorizontal },

  { id: 'orders', label: 'Заказы', icon: ShoppingBag },

  { id: 'banners', label: 'Баннеры', icon: Image },

  { id: 'settings', label: 'Настройки', icon: Settings },

];



export default function AdminDamAlem({ initialSection = 'menu', partnerMode = false }: AdminDamAlemProps) {

  const [section, setSection] = useState<Section>(initialSection);



  useEffect(() => {

    setSection(initialSection);

  }, [initialSection]);



  return (

    <div className="space-y-6">

      {/* Brand header */}

      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF3B30] via-[#e8352b] to-[#9f1e18] p-5 text-white shadow-lg md:p-6">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Раздел «Еда»</p>

            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">{DAM_ALEM_BRAND}</h2>

            <p className="mt-2 max-w-lg text-sm text-white/85">

              Полное управление: профиль, меню, опции, заказы, баннеры и настройки доставки.

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



      <AdminDamAlemGuide />



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

      {section === 'brand' && <AdminDamAlemBrand />}

      {(section === 'menu' || section === 'categories') && (

        <AdminFood

          damAlemMode

          hideSubTabs

          initialSection={section === 'categories' ? 'categories' : 'items'}

        />

      )}

      {section === 'modifiers' && <AdminDamAlemModifiers />}

      {section === 'orders' && <AdminFoodOrders damAlemMode />}

      {section === 'settings' && (
        <>
          <AdminFoodSettings damAlemMode />
          {!partnerMode && <AdminDamAlemPartnerAccess />}
        </>
      )}

      {section === 'banners' && <AdminDamAlemBanners />}

      {!partnerMode && (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600">
        <p className="font-semibold text-gray-800">FrontPad и POS</p>
        <p className="mt-1">Синхронизация меню и заказов с кассой — в разделе интеграций.</p>
        <Link
          to="/admin?tab=pos-integration"
          className="mt-2 inline-flex items-center gap-1 font-semibold text-[#FF3B30] hover:underline"
        >
          Открыть FrontPad <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      )}

    </div>

  );

}

