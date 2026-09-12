import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Utensils, ShoppingBag, Settings, Image, ExternalLink, ChefHat,
  Store, SlidersHorizontal, Plug,
} from 'lucide-react';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import AdminFood from './AdminFood';
import DamAlemOrders from './DamAlemOrders';
import DamAlemTelegram from './DamAlemTelegram';
import AdminFoodSettings from './AdminFoodSettings';
import AdminDamAlemBanners from './AdminDamAlemBanners';
import AdminDamAlemBrand from './AdminDamAlemBrand';
import AdminDamAlemModifiers from './AdminDamAlemModifiers';
import AdminFrontpad from './AdminFrontpad';
import { foodBusiness as business } from '@/lib/foodOperations';
import { DamToday, DamFinance, DamStaff, DamAvailability } from './DamAlemBusiness';
import AdminPartnerAccess from '@/components/partner/AdminPartnerAccess';

type Section = 'brand' | 'menu' | 'categories' | 'modifiers' | 'orders' | 'settings' | 'banners' | 'pos' | 'telegram' | 'today' | 'sales' | 'staff' | 'availability';

interface AdminDamAlemProps {
  initialSection?: Section;
  /** When true, hides platform-only controls (partner panel at /partner/dam-alem). */
  partnerMode?: boolean;
}

const TABS: { id: Section; label: string; icon: typeof Utensils }[] = [
  { id: 'today', label: 'Сегодня', icon: Store },
  { id: 'sales', label: 'Продажи и расходы', icon: ShoppingBag },
  { id: 'staff', label: 'Сотрудники', icon: Store },
  { id: 'availability', label: 'Есть / Закончилось', icon: ChefHat },
  { id: 'orders', label: 'Заказы', icon: ShoppingBag },
  { id: 'telegram', label: 'Telegram', icon: Plug },
  { id: 'brand', label: 'Заведение', icon: Store },
  { id: 'menu', label: 'Блюда', icon: ChefHat },
  { id: 'categories', label: 'Категории', icon: Utensils },
  { id: 'modifiers', label: 'Опции', icon: SlidersHorizontal },
  { id: 'banners', label: 'Баннеры', icon: Image },
  { id: 'settings', label: 'Настройки', icon: Settings },
  { id: 'pos', label: 'Учёт / API', icon: Plug },
];

export default function AdminDamAlem({ initialSection = 'today', partnerMode = false }: AdminDamAlemProps) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') as Section;
  const [section, setSection] = useState<Section>(TABS.some(t => t.id === requested) ? requested : initialSection);
  const [access, setAccess] = useState<'owner' | 'operator' | null>(null);
  const [accessError, setAccessError] = useState('');
  useEffect(() => { let alive = true; business<{role: 'owner' | 'operator'}>('/me').then(v => { if (alive && ['owner', 'operator'].includes(v.role)) setAccess(v.role); else if (alive) setAccessError('Не удалось определить права доступа'); }).catch(e => { if (alive) setAccessError(e.message); }); return () => { alive = false; }; }, []);
  const tabs = TABS.filter(tab => (!partnerMode || tab.id !== 'pos') && (access === 'owner' || ['today', 'orders', 'availability'].includes(tab.id)));
  const groupOf = (id: string) => ['today', 'orders', 'sales'].includes(id) ? id : ['menu', 'categories', 'modifiers', 'banners', 'availability'].includes(id) ? 'menu' : 'settings';
  const group = groupOf(section);
  const groups = [{id:'today',label:'Сегодня'}, {id:'orders',label:'Заказы'}, ...(access === 'owner' ? [{id:'sales',label:'Продажи и расходы'}] : []), {id:'menu',label:access === 'owner' ? 'Меню и акции' : 'Доступность блюд'}, ...(access === 'owner' ? [{id:'settings',label:'Настройки'}] : [])];
  const navigate = (id: string, order?: number, status?: string) => { const p = new URLSearchParams(params); p.set('section', id); if (status) p.set('status', status); else p.delete('status'); if (order) p.set('order', String(order)); else if (id !== 'orders') p.delete('order'); setParams(p); };

  useEffect(() => {
    const allowed = (id: string) => (access === 'owner' || ['today', 'orders', 'availability'].includes(id)) && (!partnerMode || id !== 'pos');
    setSection(TABS.some(t => t.id === requested) && allowed(requested) ? requested : allowed(initialSection) ? initialSection : 'today');
  }, [initialSection, partnerMode, requested, access]);

  if (!access) return <p role={accessError ? 'alert' : 'status'}>{accessError || 'Проверяем доступ к кабинету…'}</p>;
  if (access === 'operator' && !['today', 'orders', 'availability'].includes(section)) return <p>Открываем рабочий кабинет…</p>;
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF3B30] via-[#e8352b] to-[#9f1e18] p-5 text-white shadow-lg md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Интернет-магазин</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">{DAM_ALEM_BRAND}</h2>
            <p className="mt-2 max-w-lg text-sm text-white/85">
              Принимайте заказы, управляйте приготовлением и доставкой.
              Настройки меню, витрины и уведомлений — в одном кабинете.
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

      <nav aria-label="Разделы кабинета" className="flex flex-wrap gap-2">{groups.map(g => <button key={g.id} onClick={() => navigate(g.id === 'menu' && access === 'operator' ? 'availability' : g.id)} className={`rounded-xl px-4 py-3 text-sm font-semibold ${group === g.id ? 'bg-[#FF3B30] text-white' : 'bg-white border text-gray-700'}`}>{g.label}</button>)}</nav>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.filter(tab => ['menu', 'settings'].includes(group) && groupOf(tab.id) === group).map(tab => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { const p = new URLSearchParams(params); p.set('section', tab.id); setParams(p); }}
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

      {section === 'today' && <DamToday owner={access === 'owner'} navigate={navigate} />}
      {section === 'sales' && access === 'owner' && <DamFinance />}
      {section === 'staff' && access === 'owner' && <DamStaff />}
      {section === 'availability' && <DamAvailability />}
      {section === 'brand' && <AdminDamAlemBrand />}
      {(section === 'menu' || section === 'categories') && (
        <AdminFood
          damAlemMode
          hideSubTabs
          initialSection={section === 'categories' ? 'categories' : 'items'}
        />
      )}
      {section === 'telegram' && <DamAlemTelegram />}
      {section === 'modifiers' && <AdminDamAlemModifiers />}
      {section === 'orders' && <DamAlemOrders />}
      {section === 'settings' && (
        <>
          <AdminFoodSettings damAlemMode />
          {!partnerMode && <AdminPartnerAccess partnerType="dam_alem" />}
          {partnerMode && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-orange-950">
              <p className="font-semibold">Система учёта</p>
              <p className="mt-1 text-orange-900/80">
                API-ключи кассы (FrontPad) подключает администратор портала во вкладке «Учёт / API» интернет-магазина DAM ALEM 2.0.
              </p>
            </div>
          )}
        </>
      )}
      {section === 'banners' && <AdminDamAlemBanners />}
      {section === 'pos' && !partnerMode && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-orange-950">
            <p className="font-semibold">Система учёта по API-ключам</p>
            <p className="mt-1 text-orange-900/80">
              Подключите кассу FrontPad: секрет меню синхронизирует блюда, секрет заказов
              отправляет новые заказы из магазина в учёт. Ключи хранятся только на сервере.
            </p>
          </div>
          <AdminFrontpad />
        </div>
      )}
    </div>
  );
}
