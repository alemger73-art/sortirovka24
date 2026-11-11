import { LEGAL_OPERATOR, LEGAL_VERSION } from '@/content/legal';
import MenuSelectionDialog from '@/components/damalem/MenuSelection';
import {publicMenu, needsSelection, type MenuProduct, type MenuCatalog, type MenuSelection} from '@/lib/damMenu';
import PickupCard from '@/components/damalem/PickupCard';
import { clientLoyalty, type MyLoyalty } from '@/lib/loyalty';
import CashAmount from '@/components/damalem/CashAmount';
import PreorderFields, {scheduleISO} from '@/components/damalem/PreorderFields';
import { useStoreTranslations, storeCheckoutBlockReason } from '@/i18n/storeTranslations';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { FoodStoreHeader } from '@/components/damalem/FoodStoreLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import {
  X, Truck, MapPin, MessageSquare, ArrowLeft, Navigation,
  Search, ShoppingCart, Clock, LayoutGrid, Heart, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAccountPrefill, isLoggedIn, pushCabinetItem, onAuthChanged, cacheAccountProfile } from '@/lib/localAuth';
import { saveFoodCheckoutReturn, takeFoodCheckoutReturn } from '@/lib/foodCheckoutReturn';
import { accountApi, getAccountToken } from '@/lib/accountApi';
import { track } from '@/lib/analytics';
import { fetchFoodRestaurantsList } from '@/lib/foodAdminApi';
import { apiUrl } from '@/lib/config';
import { DAM_ALEM_BRAND, DAM_ALEM_TAGLINE, findDamAlemRestaurantId } from '@/lib/damAlem';
import {
  saveFoodCart,
  loadFoodCart,
  clearFoodCartStorage,
  FOOD_MENU_VERSION_KEY,
} from '@/lib/foodCartStorage';
import { parseDeliveryZones, DEFAULT_STORE, type DeliveryZone } from '@/lib/gastronomDelivery';
import { fetchFoodDeliveryQuote, validateFoodPromo, type FoodDeliveryQuote } from '@/lib/foodDeliveryApi';
import {
  availableLoyaltyGiftChoices,
  isLoyaltyEnabled,
  nextLoyaltyGift,
} from '@/lib/gastronomLoyalty';
import { GeolocationError, requestCurrentPosition } from '@/lib/geolocation';
import { isKitchenOpen } from '@/lib/foodWorkingHours';
import { loadFavoriteIds, saveFavoriteIds, toggleFavoriteId } from '@/lib/foodFavorites';
import SavedAddressBar from '@/components/SavedAddressBar';
import { type SavedAddress } from '@/lib/accountApi';
import DamAlemProductCard from '@/components/damalem/DamAlemProductCard';
import DamAlemStatusStrip from '@/components/damalem/DamAlemStatusStrip';
import { resolveDamAlemItemImage } from '@/lib/damAlemImages';
import DamCartBar from '@/components/damalem/DamCartBar';
import DamOrderDone, { type OrderDoneInfo } from '@/components/damalem/DamOrderDone';
import { BonusToggle, Disclosure, Field, GiftRow, OrderLines, Segmented, SummaryRows, ruBonusNoun, type OrderLineView, type SummaryRow } from '@/components/damalem/DamOrderParts';
import DamAlemStickyPills from '@/components/damalem/DamAlemStickyPills';
import StoreProfileTab from '@/components/StoreProfileTab';
import { publicOrderErrorMessage } from '@/lib/foodCheckoutGuards';
import { calcPromoDiscount, isPromoCurrent } from '@/lib/foodPromo';
import DamAlemPageSkeleton from '@/components/damalem/DamAlemPageSkeleton';
import LoadErrorState from '@/components/LoadErrorState';
import DamAlemPromoBanners, { type FoodBanner } from '@/components/damalem/DamAlemPromoBanners';
import DamAlemPromoStrip from '@/components/damalem/DamAlemPromoStrip';
import DeliveryZonesPreview from '@/components/damalem/DeliveryZonesPreview';
import { resolveLoyaltyGifts, resolvePromoCodes, type FoodBannerAction } from '@/lib/damAlemMarketing';
import { isFoodBanner } from '@/lib/foodBannerActions';
import '@/styles/damAlem.css';
import '@/styles/foodResponsive.css';
import '@/styles/damRefresh.css';
import '@/styles/damSimple.css';

/* ─── Types ─── */
interface FoodCategory {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  slug?: string;
  image?: string;
  restaurant_id?: number | null;
  category_type?: string | null;
}
interface FoodItem extends Omit<MenuProduct, 'category_id'> {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_active: boolean;
  is_recommended: boolean;
  weight: string;
  sort_order: number;
  available_in_park?: boolean;
  is_popular?: boolean;
  is_combo?: boolean;
  category_slug?: string;
  restaurant_id?: number | null;
  available?: boolean;
}
interface ModifierGroup { id: number; name: string; type: string; is_required: boolean; min_select: number; max_select: number; sort_order: number; is_active: boolean; }
interface ModifierOption { id: number; group_id: number; name: string; price: number; sort_order: number; is_active: boolean; }
interface ItemModGroupLink { id: number; food_item_id: number; modifier_group_id: number; sort_order: number; }
interface Settings {
  whatsapp_number: string; hero_banner_title: string; hero_banner_subtitle: string;
  hero_banner_image: string; min_order_amount: string; delivery_price: string;
  delivery_zones: string; show_recommendations: string; promo_slides?: string;
  service_fee_rate?: string; free_delivery_from?: string; default_address?: string;
  apartment_delivery_price?: string; apartment_free_from?: string;
  loyalty_enabled?: string; loyalty_gifts?: string;
  delivery_city?: string; delivery_area?: string;
  delivery_time?: string; working_hours?: string; promo_codes?: string;
  store_lat?: string; store_lng?: string;
  [key: string]: string | undefined;
}

const REPEAT_ORDER_KEY = 'damalem_repeat_order';
const LAST_ORDER_KEY = 'damalem_last_order_v1';
interface BrandProfile {
  id: number;
  name: string;
  photo?: string;
  description?: string;
  rating?: number;
  delivery_time?: string;
  min_order?: number;
  whatsapp_phone?: string;
}

interface CreatedOrder {
  id?: number;
  total_amount?: number;
  loyalty_snapshot?: { eligible_amount?: string; bonus_rate?: string; policy?: { earning_enabled?: boolean } } | null;
}

/** Bonuses the server adds after delivery, read from the saved order's own loyalty snapshot. */
function orderCashback(snapshot: CreatedOrder['loyalty_snapshot']): number | null {
  if (!snapshot) return null;
  if (snapshot.policy?.earning_enabled === false) return 0;
  const eligible = Number(snapshot.eligible_amount), rate = Number(snapshot.bonus_rate);
  return Number.isFinite(eligible) && Number.isFinite(rate) ? Math.round(eligible * rate / 100) : null;
}

/** +7 7XX XXX XX XX for a Kaspi/Halyk invoice, or '' when the number is incomplete. */
function invoicePhoneValue(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d.length === 11 && d.startsWith('77') ? `+${d}` : '';
}

type BonusRules = Awaited<ReturnType<typeof accountApi.bonusRules>>;
const NO_BONUS_RULES: BonusRules = { enabled: false, tenge_rate: 1, max_order_percent: 0 };

const PAYMENT_LABELS: Record<'cash' | 'kaspi_qr' | 'halyk_qr', string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi',
  halyk_qr: 'Halyk',
};

interface CartItemSelection { [groupId: number]: number[]; }
interface CartItem { item: FoodItem; quantity: number; selections: CartItemSelection; choices?: MenuSelection['choices']; }

/* ─── Badge (как Tasko: «Хит» — красная таблетка, только текст) ─── */
function FoodBadge({ type }: { type: 'hit' | 'new' }) {
  const { t } = useLanguage();
  const config = {
    hit: { text: t('food.hit'), className: 'bg-[#FF3B30] text-white' },
    new: { text: t('food.new'), className: 'bg-[#111111] text-white' },
  };
  const c = config[type];
  return (
    <span className={`${c.className} text-[11px] font-bold px-2.5 py-1 rounded-full tracking-tight`}>
      {c.text}
    </span>
  );
}

function itemDisplayWeight(item: FoodItem): string {
  const w = (item.weight || '').trim();
  if (!w) return '';
  if (!/^\d+(?:[.,]\d+)?$/.test(w)) return w;
  return `${w} г`;
}

function slugifyFoodCategory(text: string): string {
  const s = (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0400-\u04FF\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'category';
}

function categorySlugOf(cat: FoodCategory): string {
  const raw = (cat.slug || '').trim();
  if (raw && raw !== 'category') return raw;
  const fromName = slugifyFoodCategory(cat.name || '');
  if (fromName && fromName !== 'category') return fromName;
  return `cat-${cat.id}`;
}

type DamTab = 'menu' | 'cart' | 'favorites' | 'profile';
const DAM_TABS: DamTab[] = ['menu', 'cart', 'favorites', 'profile'];
const DAM_NAV_RU: { id: DamTab; icon: typeof LayoutGrid; label: string }[] = [
  { id: 'menu', icon: LayoutGrid, label: 'Меню' },
  { id: 'cart', icon: ShoppingCart, label: 'Корзина' },
  { id: 'favorites', icon: Heart, label: 'Избранное' },
  { id: 'profile', icon: User, label: 'Профиль' },
];
const PAGE_X = 'px-4 sm:px-6 lg:px-8 xl:px-10';

function parseDamTab(raw: string | null): DamTab {
  if (raw === 'home' || raw === 'catalog' || !raw) return 'menu';
  return DAM_TABS.includes(raw as DamTab) ? (raw as DamTab) : 'menu';
}

export default function Food() {
  const st = useStoreTranslations();
  const DAM_NAV = DAM_NAV_RU.map(item => ({ ...item, label: st(item.label) }));



  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseDamTab(searchParams.get('tab'));
  const { t, localized, lang } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const lastChipTap = useRef(0);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [modGroups, setModGroups] = useState<ModifierGroup[]>([]);
  const [modOptions, setModOptions] = useState<ModifierOption[]>([]);
  const [itemGroupLinks, setItemGroupLinks] = useState<ItemModGroupLink[]>([]);
  const modGroupsRef = useRef<ModifierGroup[]>([]);
  const modOptionsRef = useRef<ModifierOption[]>([]);
  const itemGroupLinksRef = useRef<ItemModGroupLink[]>([]);
  const [settings, setSettings] = useState<Settings>({
    whatsapp_number: '+77470304096',
    hero_banner_title: DAM_ALEM_BRAND,
    hero_banner_subtitle: DAM_ALEM_TAGLINE,
    hero_banner_image: '',
    min_order_amount: '2000',
    delivery_price: '500',
    delivery_zones: '[]',
    show_recommendations: 'true',
  });
  const cartHydratedRef = useRef(false);
  const menuVersionRef = useRef<string | null>(null);
  const modifiersLoadedRef = useRef(false);
  const modifiersLoadingRef = useRef<Promise<void> | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartAvailabilityNotice, setCartAvailabilityNotice] = useState('');
  // The order button accepts the order terms (notice above it); a guest orders without signing in.
  const [lastOrderPreview, setLastOrderPreview] = useState<{
    label: string;
    order_items: string;
    delivery_address?: string;
    delivery_method?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [promoBanners, setPromoBanners] = useState<FoodBanner[]>([]);
  const [damAlemRestaurantId, setDamAlemRestaurantId] = useState<number | null>(null);
  const [editingCartIndex,setEditingCartIndex]=useState<number|null>(null);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [currentSelections, setCurrentSelections] = useState<CartItemSelection>({});

  // Checkout form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [apartment, setApartment] = useState('');
  const [deliverToApartment, setDeliverToApartment] = useState(false);
  const [comment, setComment] = useState('');
  const [preorder,setPreorder]=useState(false),[schedule,setSchedule]=useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup' | 'dine_in'>('delivery');
  const [cashGiven, setCashGiven] = useState('');
  const [invoicePhone, setInvoicePhone] = useState('');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');
  const [orderSuccess, setOrderSuccess] = useState<OrderDoneInfo | null>(null);
  const [orderStatus, setOrderStatus] = useState('new');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryQuote, setDeliveryQuote] = useState<FoodDeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const quoteRequestId = useRef(0);
  const quotedAddress = useRef('');
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => loadFavoriteIds());
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount: number;
    free_delivery: boolean;
    label: string;
    pending?: boolean;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [bonusBalance, setBonusBalance] = useState(0);
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('ref');
    if (code && /^[A-Za-z0-9_-]{16,48}$/.test(code)) sessionStorage.setItem('dam_referral', code);
    const pending = sessionStorage.getItem('dam_referral');
    if (pending && getAccountToken()) void clientLoyalty('/referral', {code:pending}).then(() => sessionStorage.removeItem('dam_referral')).catch(() => { /* Client cabinet exposes the explicit retry and reason. */ });
  }, []);

  const [useBonuses, setUseBonusesState] = useState(false);
  // Bonuses are the customer's money: they are applied by default once the balance is known, until the person
  // unticks them (or a promo code replaces them) — then their choice stands.
  const bonusChoiceMade = useRef(false);
  const setUseBonuses = useCallback((on: boolean) => { bonusChoiceMade.current = true; setUseBonusesState(on); }, []);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [bonusRules, setBonusRules] = useState<BonusRules>(NO_BONUS_RULES);
  const BONUS_MAX_PERCENT = bonusRules.max_order_percent;
  const checkoutAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const returnDeliveryAddress = useRef<string | null>(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (searchParams.get('checkout') !== 'resume' || !isLoggedIn() || loading || cart.length === 0) return;
    const form = takeFoodCheckoutReturn();
    if (form) {
      setDeliveryMethod(form.deliveryMethod);
      setCustomerName(form.customerName);
      setCustomerPhone(form.customerPhone);
      setDeliveryAddress(form.deliveryAddress);
      returnDeliveryAddress.current = form.deliveryMethod === 'delivery' ? form.deliveryAddress : null;
      setApartment(form.apartment);
      setDeliverToApartment(form.deliverToApartment);
      setComment(form.comment);
      setPreorder(form.preorder);
      setSchedule(form.schedule);
      setCashGiven(form.cashGiven);
      setPayment(form.payment);
      setSelectedGiftId(form.selectedGiftId);
    }
    const params = new URLSearchParams(searchParams);
    params.delete('checkout');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, loading, cart.length]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_ORDER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        label?: string;
        order_items?: string;
        delivery_address?: string;
        delivery_method?: string;
      };
      if (!parsed.order_items) return;
      setLastOrderPreview({
        label: parsed.label || st("Как в прошлый раз"),
        order_items: parsed.order_items,
        delivery_address: parsed.delivery_address,
        delivery_method: parsed.delivery_method,
      });
    } catch {
      /* ignore */
    }
  }, [st]);

  // Rules are public: the guest also sees the cashback and what signing in would take off this order.
  useEffect(() => { accountApi.bonusRules().then(setBonusRules).catch(() => setBonusRules(NO_BONUS_RULES)); }, []);
  useEffect(() => {
    if (!getAccountToken()) {
      setBonusBalance(0);
      setUseBonusesState(false);
      return;
    }
    clientLoyalty<MyLoyalty>('/me')
      .then((me) => {
        const balance = Number(me?.balance || 0);
        setBonusBalance(balance);
        if (balance > 0 && !bonusChoiceMade.current) setUseBonusesState(true);
      })
      .catch(() => setBonusBalance(0));
  }, [activeTab]);

  useEffect(() => {
    try {
      menuVersionRef.current = localStorage.getItem(FOOD_MENU_VERSION_KEY);
    } catch {
      /* ignore */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === FOOD_MENU_VERSION_KEY) loadData();
    };
    const onFocus = () => {
      try {
        const v = localStorage.getItem(FOOD_MENU_VERSION_KEY);
        if (v && v !== menuVersionRef.current) {
          menuVersionRef.current = v;
          loadData();
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!cartHydratedRef.current || items.length === 0) return;
    saveFoodCart(cart);
  }, [cart, items.length]);

  useEffect(() => {
    if (items.length === 0) return;
    if (!cartHydratedRef.current) {
      const restored = loadFoodCart(items);
      if (restored.length > 0) {
        setCart(restored);
        if (restored.some(ci => Object.keys(ci.selections).length > 0)) {
          void loadModifiers();
        }
      }
      cartHydratedRef.current = true;
      return;
    }
    const unavailable = cart.filter(ci => !items.some(i => i.id === ci.item.id && i.is_active !== false && i.available !== false));
    if (unavailable.length) setCartAvailabilityNotice(st('Эти блюда закончились и удалены из корзины: {0}. Выберите замену в меню.', [unavailable.map(ci => ci.item.name).join(', ')]));
    setCart(prev => {
      const byId = new Map(items.map(i => [i.id, i]));
      const next = prev
        .map(ci => {
          const fresh = byId.get(ci.item.id);
          if (!fresh || fresh.is_active === false || fresh.available === false) return null;
          return { ...ci, item: fresh };
        })
        .filter(Boolean) as CartItem[];
      return next;
    });
  }, [items]);

  // A signed-in customer is never asked for name and phone again: they come from the account.
  useEffect(() => {
    const apply = () => {
      const prefill = getAccountPrefill();
      if (prefill.name) setCustomerName((v) => v || prefill.name);
      if (prefill.phone) setCustomerPhone((v) => v || prefill.phone);
      return prefill;
    };
    const first = apply();
    if ((!first.name || !first.phone) && getAccountToken()) {
      accountApi.me().then(me => {
        if (me?.id) cacheAccountProfile({ id: me.id, name: me.name, phone: me.phone, email: me.email, avatar: me.avatar });
        apply();
      }).catch(() => { /* the fields stay editable */ });
    }
    return onAuthChanged(() => { apply(); });
  }, []);

  function installMenuModifiers(catalog:MenuCatalog) {
    const groups=catalog.groups as ModifierGroup[];
    const options=catalog.options as ModifierOption[];
    const links=catalog.links;
    modGroupsRef.current=groups;modOptionsRef.current=options;itemGroupLinksRef.current=links;
    setModGroups(groups);setModOptions(options);setItemGroupLinks(links);modifiersLoadedRef.current=true;
  }
  function applyMenuCatalog(c:MenuCatalog) {
    installMenuModifiers(c);
    setCategories(c.categories.map(p=>({...p,icon:'🍽',is_active:true,sort_order:('sort_order' in p?Number(p.sort_order):0)})));
    setItems(c.products.filter(p=>p.sellable!==false && !p.staff_only).map(p=>({...p,category_id:p.category_id || 0,description:p.description || '',image_url:p.image_url || '',is_active:p.is_active!==false,is_recommended:!!p.is_popular,weight:p.weight || '',sort_order:p.sort_order || 0})));
  }
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible')void publicMenu().then(applyMenuCatalog).catch(()=>{});};
    const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  function selectionOf(ci:CartItem):MenuSelection {
    const counts=new Map<number,number>();Object.values(ci.selections).flat().forEach(id=>counts.set(id,(counts.get(id)||0)+1));
    return {choices:ci.choices || [],modifiers:[...counts].map(([option_id,quantity])=>({option_id,quantity}))};
  }
  function productForSelection(item:FoodItem):MenuProduct {
    return item.modifier_groups ? item : {...item,modifier_groups:getGroupsForItem(item.id).map(g=>({...g,options:getOptionsForGroup(g.id)}))};
  }
  function choicePrice(ci:CartItem) {return (ci.choices || []).reduce((sum,c)=>sum+Number(ci.item.combo?.groups.find(g=>g.id===c.group_id)?.options.find(o=>o.item_id===c.item_id)?.surcharge || 0),0);}
  function comboNames(ci:CartItem) {return [...(ci.item.combo?.components || []).map(p=>p.name+' ×'+p.quantity),...(ci.choices || []).map(c=>{const group=ci.item.combo?.groups.find(g=>g.id===c.group_id);const p=group?.options.find(o=>o.item_id===c.item_id);return p?group?.name+': '+p.name+' ×'+p.quantity:'';})].filter(Boolean);}
  async function loadModifiers(force = false) {
    if (!force && modifiersLoadedRef.current) return;
    if (modifiersLoadingRef.current) {
      await modifiersLoadingRef.current;
      return;
    }

    const CACHE_TTL = 5 * 60 * 1000;
    const cq = (key: string, fn: () => Promise<any>) => fetchWithCache(`food_${key}`, () => withRetry(fn), CACHE_TTL);

    const task = (async () => {
      try {
        const results = await Promise.allSettled([
          cq('mod_groups', () => client.entities.modifier_groups.query({ sort: 'sort_order', limit: 200 })),
          cq('mod_options', () => client.entities.modifier_options.query({ sort: 'sort_order', limit: 1000 })),
          cq('item_groups', () => client.entities.item_modifier_groups.query({ limit: 2000 })),
        ]);
        const extract = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? (r.value?.data?.items || []) : []);

        const groups = extract(results[0])
          .filter((g: ModifierGroup) => g.is_active)
          .map((g: ModifierGroup) => ({
            ...g,
            type: g.type === 'single' ? 'radio' : (g.type === 'multiple' || g.type === 'quantity') ? 'checkbox' : g.type,
          }));
        const options = extract(results[1]).filter((o: ModifierOption) => o.is_active);
        const links = extract(results[2]);
        modGroupsRef.current = groups;
        modOptionsRef.current = options;
        itemGroupLinksRef.current = links;
        setModGroups(groups);
        setModOptions(options);
        setItemGroupLinks(links);
        modifiersLoadedRef.current = true;
      } catch (e) {
        console.warn('[Food] modifiers load failed:', e);
      } finally {
        modifiersLoadingRef.current = null;
      }
    })();

    modifiersLoadingRef.current = task;
    await task;
  }

  async function loadData() {
    modifiersLoadedRef.current = false;
    setLoading(true);
    setLoadError(false);
    const CACHE_TTL = 5 * 60 * 1000;
    const cq = (key: string, fn: () => Promise<any>) => fetchWithCache(`food_${key}`, () => withRetry(fn), CACHE_TTL);
    const catalogHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'App-Host': typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
    };
    try {
      const restaurants = await fetchFoodRestaurantsList();
      const rid = findDamAlemRestaurantId(restaurants);
      setDamAlemRestaurantId(rid);
      const brand = rid != null ? restaurants.find(r => r.id === rid) : restaurants[0];
      if (brand) setBrandProfile(brand);

      const restaurantQs = rid != null ? `?restaurant_id=${rid}` : '';
      let configuredCatalog: MenuCatalog | null = null;
      try { configuredCatalog = await publicMenu(); } catch (e) { if ((e as Error & {status?:number}).status!==404) throw e; }
      let cats: FoodCategory[] | null = null;
      let foodItems: FoodItem[] | null = null;
      try {
        const [cRes, pRes] = await Promise.all([
          fetch(apiUrl(`/api/categories${restaurantQs}`), { headers: catalogHeaders }),
          fetch(apiUrl(`/api/products${restaurantQs}`), { headers: catalogHeaders }),
        ]);
        if (cRes.ok && pRes.ok) {
          const cj = await cRes.json();
          const pj = await pRes.json();
          const rawCats = Array.isArray(cj.categories) ? cj.categories : [];
          const mappedCats: FoodCategory[] = rawCats
            .filter((c: any) => {
              const t = String(c.category_type || '').toLowerCase();
              return t !== 'delivery' && t !== 'seasonal' && t !== 'service';
            })
            .map((c: any) => {
            const base: FoodCategory = {
              id: c.id,
              name: c.name,
              slug: c.slug,
              image: c.image,
              icon: (c.image && String(c.image).trim()) ? '' : '🍽',
              sort_order: typeof c.order === 'number' ? c.order : 0,
              is_active: true,
            };
            return { ...base, slug: categorySlugOf(base) };
          });
          const slugById: Record<number, string> = {};
          for (const c of mappedCats) slugById[c.id] = categorySlugOf(c);
          const rawProds = Array.isArray(pj.products) ? pj.products : [];
          foodItems = rawProds
            .filter((p: any) => p.available !== false && !p.staff_only)
            .map((p: any) => ({
              id: p.id,
              category_id: p.category_id,
              name: p.title,
              description: p.description || '',
              price: Number(p.price) || 0,
              image_url: p.image || '',
              is_active: true,
              is_recommended: !!(p.is_popular),
              is_popular: !!(p.is_popular),
              is_combo: !!(p.is_combo),
              weight: p.weight || '',
              sort_order: typeof p.sort_order === 'number' ? p.sort_order : 0,
              category_slug: slugById[p.category_id] || (p.category_slug as string) || '',
            }));
          cats = mappedCats;
        }
      } catch (e) {
        console.warn('[Food] catalog API:', e);
      }

      const results = await Promise.allSettled([
        cats
          ? Promise.resolve({ data: { items: [] as FoodCategory[] } })
          : cq('categories', () => client.entities.food_categories.query({ sort: 'sort_order', limit: 200 })),
        foodItems
          ? Promise.resolve({ data: { items: [] as FoodItem[] } })
          : cq('items', () => client.entities.food_items.query({ sort: 'sort_order', limit: 500 })),
        cq('settings', () => client.entities.food_settings.query({ limit: 50 })),
        cq('banners', () => client.entities.banners.query({ query: { active: true }, sort: '-id', limit: 2000 })),
      ]);
      const extract = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? (r.value?.data?.items || []) : []);

      const filterByRestaurant = <T extends { restaurant_id?: number | null }>(rows: T[]) =>
        rid != null ? rows.filter(r => r.restaurant_id == null || r.restaurant_id === rid) : rows;

      if (configuredCatalog) {
        applyMenuCatalog(configuredCatalog);
      } else if (cats && foodItems) {
        setCategories(cats);
        setItems(foodItems);
      } else {
        const ecats: FoodCategory[] = filterByRestaurant(extract(results[0]) as FoodCategory[]).filter((c: FoodCategory) => {
          if (c.is_active === false) return false;
          const t = String(c.category_type || '').toLowerCase();
          return t !== 'delivery' && t !== 'seasonal' && t !== 'service';
        });
        const eitems: FoodItem[] = filterByRestaurant(extract(results[1]) as FoodItem[])
          .filter((i: FoodItem) => i.is_active !== false && i.available !== false && Number(i.price) > 0)
          .map((i: FoodItem) => ({
            ...i,
            is_popular: i.is_popular ?? i.is_recommended,
            is_combo: i.is_combo ?? false,
          }));
        const slugById: Record<number, string> = {};
        for (const c of ecats) slugById[c.id] = categorySlugOf(c);
        setCategories(ecats);
        setItems(
          eitems.map(it => ({
            ...it,
            category_slug: it.category_slug || slugById[it.category_id] || '',
          }))
        );
      }

      const settingsArr = extract(results[2]);
      const s: Record<string, string> = {};
      settingsArr.forEach((item: any) => {
        if (item.setting_key != null) s[item.setting_key] = item.setting_value ?? '';
      });
      setSettings(prev => ({ ...prev, ...s }));

      const rawBanners = extract(results[3]) as Array<FoodBanner & { link_url?: string; banner_type?: string; active?: boolean }>;
      setPromoBanners(rawBanners
        .filter(b => b.active !== false && isFoodBanner(b))
        // The portal's «DAM ALEM — Доставка еды» shop card only links back here: not needed on this page.
        .filter(b => b.banner_type !== 'shop')
        .map(b => ({
          id: b.id, title: b.title, subtitle: b.subtitle, banner_text: b.banner_text,
          image_url: b.image_url, button_text: b.button_text, button_url: b.button_url || b.link_url,
        })));

      if (!configuredCatalog) void loadModifiers(true);
    } catch (e) {
      console.error('Error loading food data:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  // Parse delivery zones (polygon + legacy radius_km)
  const storeLatNum = useMemo(
    () => parseFloat(settings.store_lat || '') || DEFAULT_STORE[0],
    [settings.store_lat],
  );
  const storeLngNum = useMemo(
    () => parseFloat(settings.store_lng || '') || DEFAULT_STORE[1],
    [settings.store_lng],
  );
  const mapDeliveryZones: DeliveryZone[] = useMemo(
    () => parseDeliveryZones(settings.delivery_zones, storeLatNum, storeLngNum),
    [settings.delivery_zones, storeLatNum, storeLngNum],
  );
  const hasDeliveryZones = mapDeliveryZones.length > 0;

  useEffect(() => { track('food_view'); }, []);
  // What people look for in the menu (and don't find) — sent once typing stops.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      const low = q.toLowerCase();
      const results = items.filter(i => `${i.name} ${i.description || ''}`.toLowerCase().includes(low)).length;
      track('search', { area: 'меню', q: q.slice(0, 60), results });
    }, 1500);
    return () => clearTimeout(timer);
  }, [searchQuery, items]);

  const poolItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => {
      const name = (localized(i, 'name') || i.name || '').toLowerCase();
      const desc = (localized(i, 'description') || i.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [items, searchQuery, localized]);

  const favoriteItems = useMemo(
    () => items.filter(i => favoriteIds.includes(i.id)),
    [items, favoriteIds],
  );
  const configuredPromos = useMemo(
    () => resolvePromoCodes(settings.promo_codes).filter((promo) => isPromoCurrent(promo)),
    [settings.promo_codes],
  );
  const promoDeepLinkRef = useRef('');
  const [promoDeepLinkCode, setPromoDeepLinkCode] = useState('');
  useEffect(() => {
    const hash = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.replace(/^#\??/, ''))
      : new URLSearchParams();
    const code = (
      searchParams.get('promo') ||
      searchParams.get('code') ||
      hash.get('promo') ||
      hash.get('code') ||
      ''
    ).trim().toUpperCase();
    if (!code || promoDeepLinkRef.current === code) return;
    promoDeepLinkRef.current = code;
    setPromoDeepLinkCode(code);
  }, [searchParams]);

  const formatDamPrice = useCallback(
    (price: number) => price.toLocaleString('ru-RU') + ' ₸',
    [],
  );

  const menuCategorySections = useMemo(() => {
    const dishPriority = (name: string) => /лагман|лағман/i.test(name) ? 0 : /манты|манти|мәнті/i.test(name) ? 1 : 2;
    const compareDishes = (a: FoodItem, b: FoodItem) => dishPriority(a.name) - dishPriority(b.name) || (a.sort_order || 0) - (b.sort_order || 0);
    const combos = poolItems.filter(item => item.is_combo).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const sections = categories.map(category => ({
      category,
      items: poolItems.filter(item => item.category_id === category.id && !item.is_combo).sort(compareDishes),
    })).filter(section => section.items.length > 0);
    if (combos.length) sections.push({ category: { id: -1, name: 'Комбо', slug: 'combo', icon: '', sort_order: -1, is_active: true }, items: combos });
    const sectionPriority = (section: typeof sections[number]) => /горячие\s+блюда|ыстық\s+тағам|вторые\s+блюда/i.test(section.category.name) || section.items.some(item => dishPriority(item.name) < 2) ? 0 : section.category.id === -1 ? 1 : 2;
    return sections.sort((a, b) => sectionPriority(a) - sectionPriority(b) || (a.category.sort_order || 0) - (b.category.sort_order || 0));
  }, [categories, poolItems]);
  const categoryPills = useMemo(
    () => menuCategorySections.map(({ category }) => ({ id: String(category.id), label: category.name })),
    [menuCategorySections],
  );
  // «Хиты»: the dishes the owner marks popular; until he marks any, the first dishes of his own menu order.
  const hitItems = useMemo(() => {
    const popular = items.filter(i => i.is_popular || i.is_recommended);
    return (popular.length > 1 ? popular : menuCategorySections.flatMap(section => section.items)).slice(0, 8);
  }, [items, menuCategorySections]);
  const patchSearch = useCallback((patch: (p: URLSearchParams) => void, replace = false) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      patch(next);
      return next;
    }, { replace });
  }, [setSearchParams]);

  const setActiveTab = useCallback((tab: DamTab, replace = false) => {
    patchSearch(p => {
      if (tab === 'menu') p.delete('tab');
      else p.set('tab', tab);
    }, replace);
  }, [patchSearch]);

  /** Puts a menu section right under the sticky header and chips. With `settle`, keeps it there while
   *  photos and banners above finish loading (the page grows), unless the person starts scrolling. */
  const scrollToSection = useCallback((categoryId: number, settle = false) => {
    let tries = 0;
    let stopped = false;
    const stop = () => { stopped = true; };
    if (settle) {
      window.addEventListener('wheel', stop, { once: true, passive: true });
      window.addEventListener('touchstart', stop, { once: true, passive: true });
    }
    const go = () => {
      if (stopped) return;
      const el = document.getElementById(`dam-category-${categoryId}`);
      if (el) {
        lastChipTap.current = Date.now(); // keep this chip highlighted while the page moves
        const pills = document.getElementById('dam-market-categories');
        // Where the sticky chips end once they are stuck: their own `top` + height.
        const stickyTop = pills ? (parseFloat(getComputedStyle(pills).top) || 0) : 0;
        const offset = (pills ? stickyTop + pills.getBoundingClientRect().height : 120) + 12;
        const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
        if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: tries === 0 && !settle ? 'smooth' : 'auto' });
      }
      tries += 1;
      if (settle && tries < 10) window.setTimeout(go, tries < 4 ? 200 : 400);
      else if (settle) { window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); }
    };
    window.setTimeout(go, 30); // not requestAnimationFrame: it never fires in background or embedded views
  }, []);

  const openCatalog = useCallback((categoryId?: number | null, settle = false) => {
    setSelectedCategoryId(categoryId === undefined ? selectedCategoryId : categoryId);
    setActiveTab('menu');
    if (categoryId != null) scrollToSection(categoryId, settle);
  }, [selectedCategoryId, setActiveTab, scrollToSection]);
  // /food?category=pizza-30 (home page circles, banners): open exactly that section.
  // Wait until the section really exists — categories arrive before the dishes.
  const categoryDeepLinkRef = useRef('');
  useEffect(() => {
    if (menuCategorySections.length === 0 || typeof window === 'undefined') return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#\??/, ''));
    const slug = (searchParams.get('category') || hash.get('category') || hash.get('cat') || '').trim();
    if (!slug || categoryDeepLinkRef.current === slug) return;
    const section = menuCategorySections.find(({ category }) => categorySlugOf(category) === slug || (slug === 'combo' && category.id === -1));
    if (!section) return;
    categoryDeepLinkRef.current = slug;
    openCatalog(section.category.id, true);
  }, [menuCategorySections, openCatalog, searchParams]);

  useEffect(() => {
    if (activeTab !== 'menu' || searchQuery.trim() || menuCategorySections.length === 0) return;
    const sections = menuCategorySections
      .map(({ category }) => document.getElementById(`dam-category-${category.id}`))
      .filter(Boolean) as HTMLElement[];
    // The highlighted chip is the last section whose title has passed under the sticky header + chips.
    // (lastChipTap: a chip tapped by the person stays highlighted while the page scrolls to it.)
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() - lastChipTap.current < 1200) return;
      const pills = document.getElementById('dam-market-categories');
      const line = (pills ? pills.getBoundingClientRect().bottom : 200) + 16;
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) current = section; else break;
      }
      // At the very bottom a short last section never reaches the line.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) current = sections[sections.length - 1];
      if (current) setSelectedCategoryId(Number(current.id.replace('dam-category-', '')));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [activeTab, menuCategorySections, searchQuery]);

  // Get modifier groups for a food item
  const getGroupsForItem = useCallback((itemId: number): ModifierGroup[] => {
    const groupIds = itemGroupLinksRef.current
      .filter(l => l.food_item_id === itemId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(l => l.modifier_group_id);
    return groupIds.map(gid => modGroupsRef.current.find(g => g.id === gid)).filter(Boolean) as ModifierGroup[];
  }, []);

  const getOptionsForGroup = useCallback((groupId: number): ModifierOption[] => {
    return modOptionsRef.current
      .filter(o => o.group_id === groupId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, []);

  const itemHasGroups = useCallback((itemId: number): boolean => {
    return itemGroupLinksRef.current.some(l => l.food_item_id === itemId);
  }, []);

  function calcSelectionsPrice(selections: CartItemSelection): number {
    let total = 0;
    for (const groupId of Object.keys(selections)) {
      const optionIds = selections[Number(groupId)];
      for (const optId of optionIds) {
        const opt = modOptionsRef.current.find(o => o.id === optId);
        if (opt) total += opt.price;
      }
    }
    return total;
  }

  function getSelectionNames(selections: CartItemSelection): string[] {
    const names: string[] = [];
    for (const groupId of Object.keys(selections)) {
      const optionIds = selections[Number(groupId)];
      for (const optId of optionIds) {
        const opt = modOptionsRef.current.find(o => o.id === optId);
        if (opt) names.push(opt.price > 0 ? `${opt.name} (+${opt.price.toLocaleString('ru-RU')} ₸)` : opt.name);
      }
    }
    return names;
  }

  function selectionsKey(selections: CartItemSelection): string {
    const sorted: string[] = [];
    for (const gid of Object.keys(selections).sort()) {
      const opts = (selections[Number(gid)] || []).sort();
      sorted.push(`${gid}:${opts.join(',')}`);
    }
    return sorted.join('|');
  }

  const cartTotal = useMemo(() => cart.reduce((sum, ci) => {
    const modTotal = calcSelectionsPrice(ci.selections);
    return sum + (ci.item.price + choicePrice(ci) + modTotal) * ci.quantity;
  }, 0), [cart, modOptions]);

  const cartCount = useMemo(() => cart.reduce((sum, ci) => sum + ci.quantity, 0), [cart]);
  const serviceFeeRate = useMemo(() => {
    const raw = settings.service_fee_rate;
    if (raw == null || raw === '') return 0.1;
    const v = parseFloat(raw);
    if (Number.isNaN(v)) return 0.1;
    return v > 1 ? v / 100 : v;
  }, [settings.service_fee_rate]);
  const serviceFeeAmount = useMemo(() => deliveryMethod === 'dine_in' ? 0 : Math.round(cartTotal * serviceFeeRate), [cartTotal, serviceFeeRate, deliveryMethod]);
  const cartTotalWithService = cartTotal + serviceFeeAmount;
  const serviceFeePercent = Math.round(serviceFeeRate * 100);
  const serviceFeeLabel = `${t('food.serviceFeeBase')} (${serviceFeePercent}%)`;

  const freeDeliveryFrom = useMemo(
    // Same as the server: an empty setting means there is no free-delivery threshold.
    () => Math.max(0, Number(settings.free_delivery_from || 0)),
    [settings.free_delivery_from],
  );
  const apartmentDeliveryPrice = useMemo(
    () => Math.max(0, Number(settings.apartment_delivery_price || 300)),
    [settings.apartment_delivery_price],
  );
  const apartmentFreeFrom = useMemo(
    () => Math.max(0, Number(settings.apartment_free_from || settings.free_delivery_from || 0)),
    [settings.apartment_free_from, settings.free_delivery_from],
  );
  const loyaltyGifts = useMemo(
    () => resolveLoyaltyGifts(settings.loyalty_gifts, isLoyaltyEnabled(settings)).filter(gift =>
      !gift.product_id && !gift.product_name || items.some(item => gift.product_id ? item.id === gift.product_id : item.name === gift.product_name)),
    [settings.loyalty_gifts, settings.loyalty_enabled, items],
  );
  const availableGiftChoices = useMemo(
    () => availableLoyaltyGiftChoices(cartTotal, loyaltyGifts),
    [cartTotal, loyaltyGifts],
  );
  const loyaltyGift = useMemo(
    () => availableGiftChoices.find((gift) => gift.id === selectedGiftId) ?? null,
    [availableGiftChoices, selectedGiftId],
  );
  const nextGift = useMemo(
    () => nextLoyaltyGift(cartTotal, loyaltyGifts),
    [cartTotal, loyaltyGifts],
  );

  // The gift is picked for the customer as soon as the threshold is reached; «Сменить» goes through the others.
  useEffect(() => {
    setSelectedGiftId((current) =>
      current && availableGiftChoices.some((gift) => gift.id === current) ? current : availableGiftChoices[0]?.id ?? null,
    );
  }, [availableGiftChoices]);
  const nextGiftChoice = useCallback(() => {
    const index = availableGiftChoices.findIndex((gift) => gift.id === selectedGiftId);
    setSelectedGiftId(availableGiftChoices[(index + 1) % availableGiftChoices.length]?.id ?? null);
  }, [availableGiftChoices, selectedGiftId]);
  const sectionDeepLinkRef = useRef('');
  useEffect(() => {
    if (items.length === 0 || typeof window === 'undefined') return;
    const action = window.location.hash.replace(/^#/, '').split(/[?&]/)[0];
    if (!['gifts', 'popular'].includes(action) || sectionDeepLinkRef.current === action) return;
    sectionDeepLinkRef.current = action;
    if (action === 'popular') {
      requestAnimationFrame(() => {
        (document.getElementById('alem-hits') || document.getElementById('dam-menu'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    const firstGift = loyaltyGifts.filter((gift) => gift.is_active).sort((a, b) => a.min_amount - b.min_amount)[0];
    if (cartCount > 0) {
      setActiveTab('cart');
    } else if (firstGift) {
      toast.info(st("Соберите заказ от {0} ₸ и выберите подарок", [firstGift.min_amount.toLocaleString('ru-RU')]));
      requestAnimationFrame(() => {
        (document.getElementById('dam-market-categories') || document.getElementById('dam-menu'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [st, items.length, loyaltyGifts, cartCount, setActiveTab]);

  const kitchenStatus = useMemo(() => {
    const status = isKitchenOpen(settings);
    return { ...status, message: status.open ? undefined : st('Сейчас закрыто · принимаем заказы с {0} до {1} · можно оформить заранее', [status.opensAt, status.closesAt]) };
  }, [settings, st]);
  const deliveryTimeLabel = useMemo(() => {
    const raw = String(settings.delivery_time || brandProfile?.delivery_time || '').trim();
    if (!raw) return st("35–45 мин");
    // «20-30» → «20–30 мин»: a bare range is unclear to customers.
    return /^\d+\s*[-–]\s*\d+$/.test(raw) ? `${raw.replace(/\s*[-–]\s*/, '–')} ${st('мин')}` : raw;
  }, [settings.delivery_time, brandProfile?.delivery_time, st]);

  // Kitchen closed: the order can only be prepared later, so start with «Выбрать дату и время».
  useEffect(() => { if (activeTab === 'cart' && !kitchenStatus.open) setPreorder(true); }, [activeTab, kitchenStatus.open]);
  // Switching between menu / cart / favourites starts at the top, not where the previous tab was scrolled.
  const firstTabRender = useRef(true);
  useEffect(() => {
    if (firstTabRender.current) { firstTabRender.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  const promoDiscountAmount = appliedPromo?.discount ?? 0;
  const promoFreeDelivery = appliedPromo?.free_delivery ?? false;

  const effectiveAddress = useMemo(
    () => deliveryAddress.trim() || settings.default_address?.trim() || '',
    [deliveryAddress, settings.default_address],
  );

  const runDeliveryQuote = useCallback(async (
    body: { address?: string; lat?: number; lng?: number },
    options?: { notify?: boolean; fillAddress?: boolean },
  ) => {
    const reqId = ++quoteRequestId.current;
    setDeliveryQuoteLoading(true);
    setDeliveryQuoteError(null);
    try {
      const quote = await fetchFoodDeliveryQuote({ ...body, cart_subtotal: cartTotal });
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(quote);
      if (options?.fillAddress && quote.display_address) {
        quotedAddress.current = quote.display_address;
        setDeliveryAddress(quote.display_address);
      }
      if (quote.location_warning) {
        setDeliveryQuoteError(quote.location_warning);
        if (options?.notify) toast.warning(quote.location_warning);
      } else if (!quote.available) {
        const msg = quote.message || st("Доставка по этому адресу недоступна");
        setDeliveryQuoteError(msg);
        if (options?.notify) toast.error(msg);
      }
    } catch (e) {
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(null);
      const msg = e instanceof Error ? e.message : st("Не удалось рассчитать доставку");
      setDeliveryQuoteError(msg);
      if (options?.notify) toast.error(msg);
    } finally {
      if (reqId === quoteRequestId.current) setDeliveryQuoteLoading(false);
    }
  }, [st, cartTotal]);

  useEffect(() => {
    const address = returnDeliveryAddress.current;
    if (!address || loading || cart.length === 0) return;
    returnDeliveryAddress.current = null;
    void runDeliveryQuote({ address });
  }, [loading, cart.length, runDeliveryQuote]);

  const requestGeolocation = useCallback(async () => {
    setDeliveryQuoteLoading(true);
    try {
      const coords = await requestCurrentPosition();
      await runDeliveryQuote(
        { lat: coords.lat, lng: coords.lng },
        { notify: true, fillAddress: true },
      );
    } catch (err) {
      setDeliveryQuoteLoading(false);
      if (err instanceof GeolocationError) {
        if (err.code === 'denied') {
          toast.error(st("Разрешите доступ к геолокации в настройках телефона"));
        } else {
          toast.error(st("Не удалось получить GPS. Введите адрес вручную."));
        }
        return;
      }
      toast.error(st("Не удалось получить GPS. Введите адрес вручную."));
    }
  }, [st, runDeliveryQuote]);

  const applySavedAddress = useCallback((saved: SavedAddress, opts?: { auto?: boolean }) => {
    setDeliveryAddress(saved.address);
    quotedAddress.current = saved.address;
    void runDeliveryQuote(
      saved.lat != null && saved.lng != null
        ? { address: saved.address, lat: saved.lat, lng: saved.lng }
        : { address: saved.address },
      { notify: !opts?.auto },
    );
  }, [runDeliveryQuote]);

  // One address line: the zone and price are checked once the person stops typing (or leaves the field).
  const quoteTypedAddress = useCallback(() => {
    const address = deliveryAddress.trim();
    if (deliveryMethod !== 'delivery' || !hasDeliveryZones || address.length < 5 || address === quotedAddress.current) return;
    quotedAddress.current = address;
    void runDeliveryQuote({ address });
  }, [deliveryAddress, deliveryMethod, hasDeliveryZones, runDeliveryQuote]);
  useEffect(() => {
    if (activeTab !== 'cart') return;
    const timer = window.setTimeout(quoteTypedAddress, 900);
    return () => window.clearTimeout(timer);
  }, [activeTab, quoteTypedAddress]);

  useEffect(() => {
    if (deliveryQuote?.lat != null && deliveryQuote?.lng != null && cartTotal >= 0) {
      void runDeliveryQuote({ lat: deliveryQuote.lat, lng: deliveryQuote.lng });
    }
  }, [cartTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const def = settings.default_address?.trim();
    if (def && !deliveryAddress.trim() && hasDeliveryZones) {
      setDeliveryAddress(def);
    }
  }, [settings.default_address, hasDeliveryZones]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliveryFeeKnown = useMemo(() => {
    if (deliveryMethod !== 'delivery') return true;
    if (promoFreeDelivery || (freeDeliveryFrom > 0 && cartTotal >= freeDeliveryFrom)) return true;
    if (hasDeliveryZones) return deliveryQuote?.available === true;
    return true;
  }, [deliveryMethod, promoFreeDelivery, cartTotal, freeDeliveryFrom, hasDeliveryZones, deliveryQuote]);

  const activeDeliveryPrice = useMemo(() => {
    if (deliveryMethod !== 'delivery') return 0;
    if (promoFreeDelivery || (freeDeliveryFrom > 0 && cartTotal >= freeDeliveryFrom)) return 0;
    if (hasDeliveryZones) {
      if (!deliveryQuote?.available) return 0;
      return Number(deliveryQuote.delivery_fee ?? 0);
    }
    return parseInt(settings.delivery_price) || 0;
  }, [deliveryMethod, promoFreeDelivery, cartTotal, freeDeliveryFrom, hasDeliveryZones, deliveryQuote, settings.delivery_price]);

  const minOrder = useMemo(() => {
    if (brandProfile?.min_order && brandProfile.min_order > 0) return brandProfile.min_order;
    return parseInt(settings.min_order_amount) || 0;
  }, [brandProfile, settings.min_order_amount]);

  const deliveryReady = useMemo(() => {
    if (deliveryMethod !== 'delivery') return true;
    if (deliveryQuoteLoading) return false;
    const addr = (deliveryQuote?.display_address || effectiveAddress).trim();
    if (addr.length < 5) return false;
    if (hasDeliveryZones) {
      return deliveryQuote?.available === true && !deliveryQuote?.location_warning;
    }
    return true;
  }, [deliveryMethod, deliveryQuoteLoading, deliveryQuote, effectiveAddress, hasDeliveryZones]);

  const deliveryUnavailableMessage = useMemo(() => {
    if (deliveryMethod !== 'delivery' || deliveryQuoteLoading) return null;
    if (deliveryQuote?.location_warning) return deliveryQuote.location_warning;
    if (deliveryQuote && deliveryQuote.available === false) {
      return deliveryQuote.message || settings.outside_zone_message || st("Адрес вне зоны доставки");
    }
    return null;
  }, [st, deliveryMethod, deliveryQuoteLoading, deliveryQuote, settings.outside_zone_message]);

  const checkoutBlockReason = useMemo(() => {
    return storeCheckoutBlockReason({
      kitchenOpen: preorder || kitchenStatus.open,
      kitchenMessage: kitchenStatus.message,
      cartTotal,
      minOrder,
      deliveryMethod,
      deliveryReady,
      deliveryQuoteLoading,
      deliveryAddress: deliveryQuote?.display_address || effectiveAddress,
      deliveryQuoteError,
      deliveryUnavailableMessage,
      deliverToApartment,
      apartment,
      customerName,
      customerPhone,
    }, st);
  }, [st,
    kitchenStatus, preorder, cartTotal, minOrder, deliveryMethod, deliveryReady, deliveryQuoteLoading,
    deliveryQuote, effectiveAddress, deliveryQuoteError, deliveryUnavailableMessage,
    deliverToApartment, apartment, customerName, customerPhone,
  ]);
  const giftSelectionRequired = availableGiftChoices.length > 1 && !loyaltyGift;
  const checkoutFinalBlockReason = preorder && !scheduleISO(schedule) ? 'Выберите дату и время предзаказа' : giftSelectionRequired
    ? st("Выберите один бесплатный подарок")
    : checkoutBlockReason;

  // Cart and checkout are one screen: opening it with dishes is the start of checkout.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (activeTab !== 'cart') { checkoutTracked.current = false; return; }
    if (cartCount === 0 || checkoutTracked.current) return;
    checkoutTracked.current = true;
    track('checkout_open', { items: cart.length, total: cartTotal });
  }, [activeTab, cartCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const apartmentDeliveryFee = useMemo(
    () => (
      deliveryMethod === 'delivery' &&
      deliverToApartment &&
      !(apartmentFreeFrom > 0 && cartTotal >= apartmentFreeFrom) &&
      !promoFreeDelivery
        ? apartmentDeliveryPrice
        : 0
    ),
    [
      deliveryMethod,
      deliverToApartment,
      apartmentFreeFrom,
      cartTotal,
      promoFreeDelivery,
      apartmentDeliveryPrice,
    ],
  );

  /** Сумма к оплате до списания бонусов */
  const checkoutTotalBeforeBonus = useMemo(() => {
    const base = deliveryMethod === 'delivery'
      ? cartTotalWithService + activeDeliveryPrice + apartmentDeliveryFee
      : cartTotalWithService;
    return Math.max(0, base - promoDiscountAmount);
  }, [deliveryMethod, cartTotalWithService, activeDeliveryPrice, apartmentDeliveryFee, promoDiscountAmount]);

  const maxBonusPoints = useMemo(() => {
    if (!getAccountToken() || bonusBalance <= 0 || !bonusRules.enabled || bonusRules.tenge_rate <= 0) return 0;
    const capBySubtotal = Math.max(0, cartTotal - promoDiscountAmount) * (bonusRules.max_order_percent / 100) / bonusRules.tenge_rate;
    return Math.floor(Math.max(0, Math.min(bonusBalance, capBySubtotal, checkoutTotalBeforeBonus / bonusRules.tenge_rate)) * 100) / 100;
  }, [bonusBalance, cartTotal, checkoutTotalBeforeBonus, promoDiscountAmount, bonusRules]);

  const bonusDiscountAmount = useMemo(
    () => (useBonuses && maxBonusPoints > 0 ? Math.round(maxBonusPoints * bonusRules.tenge_rate * 100) / 100 : 0),
    [useBonuses, maxBonusPoints, bonusRules.tenge_rate],
  );

  /** Сумма к оплате: позиции + сервис + доставка + до квартиры − промокод − бонусы */
  const checkoutGrandTotal = useMemo(
    () => Math.max(0, checkoutTotalBeforeBonus - bonusDiscountAmount),
    [checkoutTotalBeforeBonus, bonusDiscountAmount],
  );

  /** Cashback the order will earn: the published rate on food after promo and bonuses (the server's formula). */
  const expectedCashback = Math.round(Math.max(0, cartTotal - promoDiscountAmount - bonusDiscountAmount) * (bonusRules.earn?.percent ?? 0) / 100);
  /** What a guest's sign-in would take off this order: the welcome bonus, within the spending limit. */
  const signInBonus = bonusRules.enabled
    ? Math.min(bonusRules.registration?.points ?? 0, Math.floor(Math.max(0, cartTotal - promoDiscountAmount) * bonusRules.max_order_percent / 100))
    : 0;

  // «Заказ принят» follows the real status while the customer is signed in (the guest has no order access).
  useEffect(() => {
    if (!orderSuccess?.id || orderSuccess.guest) return;
    let alive = true;
    const refresh = () => {
      if (document.hidden) return;
      accountApi.orderDetail('food', orderSuccess.id)
        .then(order => { if (alive && order?.status) setOrderStatus(String(order.status)); })
        .catch(() => { /* the last known status stays */ });
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [orderSuccess?.id, orderSuccess?.guest]);

  function getItemQuantityInCart(itemId: number) {
    return cart.filter(ci => ci.item.id === itemId).reduce((s, ci) => s + ci.quantity, 0);
  }

  function addToCart(item: FoodItem, selections: CartItemSelection = {}) {
    if (item.is_active === false || item.available === false) return;
    track('add_to_cart', { name: item.name, price: item.price });
    setCart(prev => {
      const key = selectionsKey(selections);
      const existing = prev.find(ci => ci.item.id === item.id && selectionsKey(ci.selections) === key);
      if (existing) return prev.map(ci => ci === existing ? { ...ci, quantity: ci.quantity + 1 } : ci);
      return [...prev, { item, quantity: 1, selections }];
    });
  }

  async function quickAdd(item: FoodItem) {
    await loadModifiers();
    if (needsSelection(productForSelection(item))) {
      openItemModal(item);
    } else {
      addToCart(item, {});
    }
  }

  async function openItemModal(item: FoodItem) {
    track('dish_view', { name: item.name });
    await loadModifiers();
    setSelectedItem(item);
  }

  function quickRemove(itemId: number) {
    setCart(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].item.id === itemId) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return prev;
      const updated = [...prev];
      if (updated[idx].quantity > 1) {
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity - 1 };
      } else {
        updated.splice(idx, 1);
      }
      return updated;
    });
  }

  function updateQuantity(index: number, delta: number) {
    setCart(prev => {
      if (!prev[index]) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: updated[index].quantity + delta };
      if (updated[index].quantity <= 0) updated.splice(index, 1);
      return updated;
    });
  }

  /** Sign-in from the order screen: the cart and the form are kept and the same screen comes back. */
  function signInKeepingCart() {
    saveFoodCheckoutReturn({
      step: 1, deliveryMethod, customerName, customerPhone,
      deliveryAddress, apartment, deliverToApartment, comment, preorder,
      schedule, cashGiven, payment, selectedGiftId,
    });
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'cart');
    params.set('checkout', 'resume');
    if (appliedPromo?.code) params.set('promo', appliedPromo.code);
    navigate(`/login?redirect=${encodeURIComponent(`/food?${params}`)}`);
  }

  async function submitOrder() {
    if (submittingRef.current) return;
    if (customerName.trim().length < 2 || !customerPhone.trim()) { toast.error(st('Укажите имя и телефон')); return; }
    if (payment === 'cash' && cashGiven !== '' && (!Number.isFinite(Number(cashGiven)) || Number(cashGiven) < checkoutGrandTotal)) {toast.error(st('Проверьте сумму наличных для сдачи')); return;}
    if (payment !== 'cash' && !invoicePhoneValue(invoicePhone || customerPhone)) {toast.error(st('Укажите номер, на который выставить счёт в ') + PAYMENT_LABELS[payment]); return;}
    if (checkoutFinalBlockReason) { toast.error(checkoutFinalBlockReason); return; }

    const aptPart = apartment.trim() ? `, кв. ${apartment.trim()}` : '';
    const toAptNote = deliverToApartment ? ' (до квартиры)' : ' (до подъезда)';
    const fullAddress = deliveryMethod === 'delivery'
      ? `${deliveryQuote?.display_address || effectiveAddress}${aptPart}${toAptNote}`
      : '';

    // The comment belongs to the customer. Gifts, promos, bonuses and delivery
    // fees are stored in structured order fields and may change later when an
    // operator edits the receipt. Duplicating them in the comment leaves stale
    // information in the customer's cabinet after a valid recalculation.
    const orderComment = comment.trim();

    const orderItems = cart.map(ci => ({id:ci.item.id,name:ci.item.name,price:ci.item.price+choicePrice(ci),quantity:ci.quantity,...selectionOf(ci),modTotal:calcSelectionsPrice(ci.selections)}));
    const total = checkoutGrandTotal;
    const paymentLabel = PAYMENT_LABELS[payment];
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const orderData = {
            legal_accepted: true,
            legal_version: LEGAL_VERSION,
            legal_language: lang,
            scheduled_for:preorder?scheduleISO(schedule):undefined,
            restaurant_id: damAlemRestaurantId ?? 1,
            restaurant_name: settings.hero_banner_title || brandProfile?.name || DAM_ALEM_BRAND,
            restaurant_phone: settings.whatsapp_number || brandProfile?.whatsapp_phone || '',
            order_items: JSON.stringify(orderItems),
            total_amount: total,
            delivery_fee: deliveryMethod === 'delivery' ? activeDeliveryPrice : 0,
            service_fee: serviceFeeAmount,
            ...(appliedPromo?.code && !appliedPromo.pending ? { promo_code: appliedPromo.code } : {}),
            ...(loyaltyGift ? { selected_gift_id: loyaltyGift.id } : {}),
            ...(bonusDiscountAmount > 0 ? { bonus_points_to_use: maxBonusPoints } : {}),
            ...(deliveryMethod === 'delivery' && deliverToApartment
              ? { deliver_to_apartment: true, apartment_delivery_fee: apartmentDeliveryFee }
              : {}),
            ...(deliveryMethod === 'delivery' && deliveryQuote?.lat != null && deliveryQuote?.lng != null
              ? { delivery_lat: deliveryQuote.lat, delivery_lng: deliveryQuote.lng }
              : {}),
            customer_name: customerName,
            customer_phone: customerPhone,
            delivery_address: fullAddress,
            comment: orderComment,
            delivery_method: deliveryMethod,
            payment_method: payment,
            cash_given_amount: payment === 'cash' && cashGiven !== '' ? Number(cashGiven) : undefined,
            payment_phone: payment !== 'cash' ? invoicePhoneValue(invoicePhone || customerPhone) : undefined,
      };
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(orderData)));
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      try {
        if (!checkoutAttempt.current) checkoutAttempt.current = JSON.parse(sessionStorage.getItem('dam-checkout-attempt') || 'null');
      } catch { /* Storage may be unavailable in private mode. */ }
      if (checkoutAttempt.current?.fingerprint !== fingerprint) checkoutAttempt.current = { fingerprint, key: crypto.randomUUID() };
      try { sessionStorage.setItem('dam-checkout-attempt', JSON.stringify(checkoutAttempt.current)); } catch { /* Keep the in-memory retry key. */ }
      const created = await client.entities.food_orders.create({ data: { ...orderData, request_key: checkoutAttempt.current.key } });
      checkoutAttempt.current = null;
      try { sessionStorage.removeItem('dam-checkout-attempt'); } catch { /* Order is already saved. */ }
      const createdAny = created as { data?: CreatedOrder } & CreatedOrder | undefined;
      const createdOrder = createdAny?.data ?? createdAny;
      const orderId = Number(createdOrder?.id ?? 0);
      track('order_placed', { total: checkoutGrandTotal, payment, method: deliveryMethod, items: cart.length });
      const orderItemsSnapshot = JSON.stringify(
        cart.map(ci => ({
          id: ci.item.id,
          name: ci.item.name,
          price: ci.item.price,
          quantity: ci.quantity,
          selections: ci.selections,
          choices: ci.choices || [],
          modifiers: Object.keys(ci.selections).flatMap(gid =>
            (ci.selections[Number(gid)] || []).map(optionId => ({ option_id: optionId })),
          ),
        })),
      );
      try {
        localStorage.setItem(
          LAST_ORDER_KEY,
          JSON.stringify({
            label: `${cart.length} поз. · ${total.toLocaleString('ru-RU')} ₸`,
            order_items: orderItemsSnapshot,
            delivery_address: fullAddress || undefined,
            delivery_method: deliveryMethod,
          }),
        );
        setLastOrderPreview({
          label: `${cart.length} поз. · ${total.toLocaleString('ru-RU')} ₸`,
          order_items: orderItemsSnapshot,
          delivery_address: fullAddress || undefined,
          delivery_method: deliveryMethod,
        });
      } catch {
        /* ignore */
      }
      pushCabinetItem('foodOrders', {
        title: `Заказ #${orderId || '—'} · ${total.toLocaleString('ru-RU')} ₸`,
        subtitle: deliveryMethod === 'delivery' ? fullAddress : deliveryMethod === 'dine_in' ? 'В заведении' : 'Самовывоз',
        status: 'Новый',
      });
      clearFoodCartStorage();
      setCart([]);
      setOrderStatus('new');
      setOrderSuccess({
        id: orderId,
        total: Number(createdOrder?.total_amount ?? total),
        paymentLabel,
        paymentMethod: payment,
        name: customerName,
        phone: customerPhone,
        address: deliveryMethod === 'delivery' ? fullAddress : deliveryMethod === 'dine_in' ? 'В заведении' : 'Самовывоз',
        deliveryMethod,
        invoicePhone: payment !== 'cash' ? invoicePhoneValue(invoicePhone || customerPhone) : undefined,
        itemsText: cart.map(ci => `${ci.item.name} × ${ci.quantity}`).join(', '),
        giftTitle: loyaltyGift?.title,
        cashback: orderCashback(createdOrder?.loyalty_snapshot) ?? expectedCashback,
        guest: !isLoggedIn(),
      });
      window.scrollTo({ top: 0 });
      // Keep the account name and phone for the next order.
      setCustomerName(getAccountPrefill().name || customerName);
      setCustomerPhone(getAccountPrefill().phone || customerPhone);
      setApartment('');
      setDeliveryAddress('');
      setDeliveryQuote(null);
      quotedAddress.current = '';
      setComment('');
      setDeliverToApartment(false);
      setPayment('cash');setCashGiven('');setInvoicePhone('');
    } catch (e) {
      console.error('Error creating order:', e);
      toast.error(publicOrderErrorMessage(e, st));
      track('order_failed', { reason: publicOrderErrorMessage(e, st).slice(0, 150), payment, method: deliveryMethod });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function openWhatsAppForOrder(info: OrderDoneInfo) {
    const whatsappNumber = settings.whatsapp_number.replace(/[^0-9]/g, '');
    let msg = `🍽 *${DAM_ALEM_BRAND} — заказ #${info.id || '—'}*\n\n👤 ${info.name}\n📞 ${info.phone}\n`;
    if (info.deliveryMethod === 'delivery') {
      msg += `📍 ${info.address}\n`;
    } else {
      msg += `🏪 Самовывоз\n`;
    }
    msg += `💳 Оплата: ${info.paymentLabel}\n`;
    msg += `\n*Итого: ${info.total.toLocaleString('ru-RU')} ₸*`;
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function formatPrice(price: number) { return formatDamPrice(price); }
  function getItemImage(item: FoodItem): string {
    return resolveDamAlemItemImage({
      id: item.id,
      name: localized(item, 'name') || item.name,
      categorySlug: item.category_slug || categorySlugOf(
        categories.find(c => c.id === item.category_id) || {
          id: item.category_id,
          name: '',
          icon: '',
          sort_order: 0,
          is_active: true,
          slug: '',
        },
      ),
      imageUrl: item.image_url,
    });
  }

  function getBadgeType(item: FoodItem): 'hit' | 'new' | null {
    if (item.is_popular || item.is_recommended) return 'hit';
    return null;
  }


  const deliveryFromPrice = useMemo(() => {
    if (mapDeliveryZones.length > 0) {
      return Math.min(...mapDeliveryZones.map(z => z.price));
    }
    return parseInt(settings.delivery_price) || 0;
  }, [mapDeliveryZones, settings.delivery_price]);

  function toggleFavorite(itemId: number) {
    const next = toggleFavoriteId(itemId);
    setFavoriteIds(next);
    saveFavoriteIds(next);
  }

  const applyPromoByCode = useCallback(async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    setPromoInput(code);
    setPromoLoading(true);
    const local = configuredPromos.find((candidate) => candidate.code === code);
    try {
      const result = await validateFoodPromo({ code, cart_subtotal: cartTotal });
      setAppliedPromo({
        code: result.code,
        discount: result.discount,
        free_delivery: result.free_delivery,
        label: result.label,
        pending: false,
      });
      setUseBonuses(false);
      toast.success(st("Промокод {0} применён", [result.code]));
    } catch (e) {
      const message = e instanceof Error ? e.message : st("Промокод недействителен");
      const belowMin = /действует от|минимал|соберите|добавьте/i.test(message)
        || (local?.min_order != null && cartTotal < (local.min_order || 0));
      if (local && belowMin) {
        const calc = calcPromoDiscount(Math.max(cartTotal, local.min_order || 0), local);
        setAppliedPromo({
          code: local.code,
          discount: 0,
          free_delivery: false,
          label: calc.label || local.label || local.code,
          pending: true,
        });
        toast.info(
          local.min_order && local.min_order > cartTotal
            ? st("Код {0} сохранён. Добавьте ещё {1} ₸", [local.code, (local.min_order - cartTotal).toLocaleString('ru-RU')])
            : st("Код {0} сохранён", [local.code]),
        );
        return;
      }
      setAppliedPromo(null);
      toast.error(message);
    } finally {
      setPromoLoading(false);
    }
  }, [st, cartTotal, configuredPromos]);

  useEffect(() => {
    if (!promoDeepLinkCode) return;
    void applyPromoByCode(promoDeepLinkCode);
    setPromoDeepLinkCode('');
  }, [promoDeepLinkCode, applyPromoByCode]);

  async function applyPromoCode() {
    await applyPromoByCode(promoInput);
  }

  function handleBannerAction(action: FoodBannerAction) {
    setSearchQuery('');
    if (action.type === 'product') {
      const item = items.find(candidate => candidate.id === action.itemId && candidate.is_active !== false && candidate.available !== false);
      if (!item) { toast.info(st("Это комбо сейчас недоступно")); return; }
      void openItemModal(item); // the full card: what is inside, then «Добавить в корзину»
      return;
    }
    if (action.type === 'promo') {
      void applyPromoByCode(action.code);
      if (action.categorySlug) {
        const cat = categories.find(c => categorySlugOf(c) === action.categorySlug);
        if (cat) openCatalog(cat.id);
      }
      return;
    }
    if (action.type === 'category') {
      const cat = categories.find(c => categorySlugOf(c) === action.slug);
      if (cat) openCatalog(cat.id);
      else { toast.info(st("Категория сейчас недоступна — выберите блюдо в меню")); document.getElementById('dam-menu')?.scrollIntoView({ behavior: 'smooth' }); }
      return;
    }
    if (action.type === 'popular') {
      (document.getElementById('alem-hits') || document.getElementById('dam-menu'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action.type === 'gifts') {
      const firstGift = loyaltyGifts
        .filter((gift) => gift.is_active)
        .sort((a, b) => a.min_amount - b.min_amount)[0];
      if (!firstGift) { toast.info(st("Сейчас подарков к заказу нет. Посмотрите другие предложения.")); return; }
      if (firstGift) {
        toast.info(
          cartTotal >= firstGift.min_amount
            ? st("Подарок уже доступен — выберите его в корзине")
            : st("Добавьте блюда ещё на {0} и выберите подарок", [formatPrice(firstGift.min_amount - cartTotal)]),
        );
      }
      setActiveTab(cartCount > 0 ? 'cart' : 'menu');
      if (cartCount === 0) {
        (document.getElementById('dam-market-categories') || document.getElementById('dam-menu'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (action.type === 'link') {
      if (action.url.startsWith('/')) navigate(action.url);
      else window.open(action.url, '_blank', 'noopener,noreferrer');
      return;
    }
    (document.getElementById('dam-market-categories') || document.getElementById('dam-menu'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    const code = appliedPromo?.code;
    if (!code) return;
    if (cartTotal <= 0) {
      const local = configuredPromos.find((candidate) => candidate.code === code);
      if (local) {
        setAppliedPromo({
          code: local.code,
          discount: 0,
          free_delivery: false,
          label: local.label || local.code,
          pending: true,
        });
      }
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      validateFoodPromo({ code, cart_subtotal: cartTotal })
        .then(result => {
          if (cancelled) return;
          setAppliedPromo(current => current?.code === code
            ? {
                code: result.code,
                discount: result.discount,
                free_delivery: result.free_delivery,
                label: result.label,
                pending: false,
              }
            : current);
        })
        .catch(() => {
          if (cancelled) return;
          const local = configuredPromos.find((candidate) => candidate.code === code);
          if (local && local.min_order && cartTotal < local.min_order) {
            setAppliedPromo({
              code: local.code,
              discount: 0,
              free_delivery: false,
              label: local.label || local.code,
              pending: true,
            });
            return;
          }
          setAppliedPromo(null);
          setPromoInput('');
          toast.info(st("Промокод больше не подходит к текущей корзине"));
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [st, cartTotal, appliedPromo?.code, configuredPromos]);

  useEffect(() => {
    if (items.length === 0) return;
    try {
      const raw = sessionStorage.getItem(REPEAT_ORDER_KEY);
      if (!raw) return;
      sessionStorage.removeItem(REPEAT_ORDER_KEY);
      const payload = JSON.parse(raw) as {
        order_items?: string;
        delivery_address?: string;
        delivery_method?: string;
      };
      void (async () => {
        await loadModifiers();
        applyRepeatPayload(payload);
      })();
    } catch {
      /* ignore */
    }
  }, [items]);

  function selectionsFromRepeatRow(row: {
    selections?: CartItemSelection;
    modifiers?: Array<{ option_id?: number; id?: number }>;
  }): CartItemSelection {
    const saved = row.selections;
    if (saved && typeof saved === 'object') {
      const restored: CartItemSelection = {};
      for (const [groupId, optionIds] of Object.entries(saved)) {
        if (!Array.isArray(optionIds)) continue;
        const ids = optionIds.map(Number).filter(id => Number.isFinite(id) && id > 0);
        if (ids.length > 0) restored[Number(groupId)] = ids;
      }
      if (Object.keys(restored).length > 0) return restored;
    }
    const fromModifiers: CartItemSelection = {};
    for (const mod of row.modifiers || []) {
      const optionId = Number(mod.option_id ?? mod.id);
      const option = modOptionsRef.current.find(candidate => candidate.id === optionId);
      if (!option) continue;
      const groupId = Number(option.group_id);
      if (!fromModifiers[groupId]) fromModifiers[groupId] = [];
      if (!fromModifiers[groupId].includes(option.id)) fromModifiers[groupId].push(option.id);
    }
    return fromModifiers;
  }

  function applyRepeatPayload(payload: {
    order_items?: string;
    delivery_address?: string;
    delivery_method?: string;
  }) {
    const parsed = payload.order_items ? JSON.parse(payload.order_items) : [];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const byId = new Map(items.map(i => [i.id, i]));
    const lines: CartItem[] = [];
    for (const row of parsed) {
      const id = Number(row.id);
      const qty = Math.max(1, Number(row.quantity) || 1);
      const fresh = byId.get(id);
      if (!fresh) continue;
      lines.push({ item: fresh, quantity: qty, selections: selectionsFromRepeatRow(row), choices: row.choices || [] });
    }
    if (lines.length > 0) {
      setCart(lines);
      toast.success(st("Заказ добавлен в корзину — можно оформить снова"));
      setActiveTab('cart');
    }
    if (payload.delivery_address) setDeliveryAddress(payload.delivery_address);
    setDeliveryMethod(payload.delivery_method === 'delivery' ? 'delivery' : 'pickup');
  }

  function MenuDishRow({
    item,
    variant = 'grid',
  }: {
    item: FoodItem;
    variant?: 'grid' | 'row' | 'hero';
  }) {
    const hasGroups = itemHasGroups(item.id);
    const qtyInCart = getItemQuantityInCart(item.id);
    const desc = (localized(item, 'description') || item.description || '').replace(/\s+/g, ' ').trim();
    const w = itemDisplayWeight(item);
    const badge = item.is_combo ? 'combo' as const : getBadgeType(item);
    return (
      <DamAlemProductCard
        name={localized(item, 'name') || item.name}
        description={desc || undefined}
        priceLabel={formatPrice(item.price)}
        imageUrl={getItemImage(item)}
        qtyInCart={qtyInCart}
        hasOptions={hasGroups}
        optionsLabel={t('food.hasOptions')}
        isFavorite={favoriteIds.includes(item.id)}
        weight={w || undefined}
        badge={badge}
        variant={variant}
        onOpen={() => void openItemModal(item)}
        onAdd={() => void quickAdd(item)}
        onRemove={() => quickRemove(item.id)}
        onToggleFavorite={() => toggleFavorite(item.id)}
      />
    );
  }

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <Layout hideHeader hideBottomNav hideFooter>
        <div className="dam-page min-h-screen bg-gray-50">
          <DamAlemPageSkeleton />
        </div>
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout hideHeader hideBottomNav hideFooter>
        <LoadErrorState onRetry={() => loadData()} />
      </Layout>
    );
  }

  const cartLines: OrderLineView[] = cart.map((ci, index) => {
    const modTotal = calcSelectionsPrice(ci.selections);
    const selNames = [...comboNames(ci),...getSelectionNames(ci.selections)];
    return {
      key: `${ci.item.id}-${selectionsKey(ci.selections)}-${index}`,
      name: localized(ci.item, 'name') || ci.item.name,
      image: getItemImage(ci.item),
      modifiers: selNames.length > 0 ? selNames.join(', ') : undefined,
      quantity: ci.quantity,
      linePrice: (ci.item.price + choicePrice(ci) + modTotal) * ci.quantity,
    };
  });
  const percentOf = (part: number, whole: number) => Math.min(100, Math.round((part / whole) * 100));
  const cartGoal = deliveryMethod !== 'dine_in' && minOrder > 0 && cartTotal < minOrder
    ? { label: st("до минимального заказа {0}", [formatPrice(minOrder - cartTotal)]), progress: percentOf(cartTotal, minOrder) }
    : loyaltyGift
      ? { label: st("подарок ваш"), progress: 100 }
      : nextGift
        ? { label: st("до подарка {0}", [formatPrice(nextGift.min_amount - cartTotal)]), progress: percentOf(cartTotal, nextGift.min_amount) }
        : null;
  const loggedIn = isLoggedIn();
  const deliveryFeeLabel = !deliveryFeeKnown ? st("по адресу") : activeDeliveryPrice === 0 ? st("бесплатно") : formatPrice(activeDeliveryPrice);
  const summaryRows: SummaryRow[] = [
    { label: st("Блюда"), value: formatPrice(cartTotal) },
    ...(loyaltyGift ? [{ label: st("Подарок: {0}", [loyaltyGift.title]), value: formatPrice(0) }] : []),
    ...(deliveryMethod === 'delivery' ? [{ label: t('food.delivery'), value: deliveryFeeLabel }] : []),
    ...(apartmentDeliveryFee > 0 ? [{ label: st("До квартиры"), value: formatPrice(apartmentDeliveryFee) }] : []),
    ...(serviceFeeAmount > 0 ? [{ label: serviceFeeLabel, value: formatPrice(serviceFeeAmount) }] : []),
    ...(appliedPromo && !appliedPromo.pending && (promoDiscountAmount > 0 || promoFreeDelivery)
      ? [{ label: st("Промокод {0}", [appliedPromo.code]), value: promoDiscountAmount > 0 ? `−${formatPrice(promoDiscountAmount)}` : st("доставка бесплатно"), discount: true }]
      : []),
    ...(bonusDiscountAmount > 0 ? [{ label: st("Бонусы"), value: `−${formatPrice(bonusDiscountAmount)}`, discount: true }] : []),
  ];
  // The order as text for the DÄM ALEM WhatsApp: for people who would rather write than fill in a form.
  const whatsappNumber = (settings.whatsapp_number || '').replace(/\D/g, '');
  const whatsappOrderHref = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent([
    `Здравствуйте! Заказ в ${DAM_ALEM_BRAND}:`,
    ...cart.map((ci, index) => `• ${ci.item.name} × ${ci.quantity} — ${formatPrice(cartLines[index].linePrice)}`),
    ...(loyaltyGift ? [`Подарок: ${loyaltyGift.title}`] : []),
    deliveryMethod === 'delivery' ? `Доставка${deliveryAddress.trim() ? `: ${deliveryAddress.trim()}${apartment.trim() ? `, кв. ${apartment.trim()}` : ''}` : ''}` : 'Самовывоз',
    ...(customerName.trim() || customerPhone.trim() ? [[customerName.trim(), customerPhone.trim()].filter(Boolean).join(', ')] : []),
    `Оплата: ${payment === 'cash' ? 'наличными' : PAYMENT_LABELS[payment]}`,
    `Итого: ${formatPrice(checkoutGrandTotal)}`,
  ].join('\n'))}` : '';
  const addressStatus = deliveryMethod !== 'delivery' || !hasDeliveryZones ? null
    : deliveryQuoteLoading ? { tone: 'busy', text: st("Проверяем адрес…") }
      : deliveryQuoteError || deliveryUnavailableMessage ? { tone: 'warn', text: String(deliveryQuoteError || deliveryUnavailableMessage) }
        : deliveryReady && deliveryQuote ? { tone: 'ok', text: `${deliveryQuote.zone_name ? `${deliveryQuote.zone_name} · ` : ''}${st("доставка")} ${deliveryFeeLabel}` }
          : null;

  function renderNavButton(tab: DamTab, Icon: typeof LayoutGrid, label: string, compact = false) {
    const isActive = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => setActiveTab(tab)}
        className={
          compact
            ? `flex-1 flex flex-col items-center py-2.5 gap-0.5 relative transition-colors ${
                isActive ? 'text-[#FF3B30]' : 'text-gray-400'
              }`
            : `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-red-50 text-[#C41E14]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
        }
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-4 w-4'} />
        {tab === 'cart' && cartCount > 0 && (
          <span
            className={
              compact
                ? 'absolute top-1.5 right-[calc(50%-14px)] flex h-4 w-4 items-center justify-center rounded-full bg-[#FF3B30] text-[9px] font-bold text-white'
                : 'ml-0.5 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-[#FF3B30] text-[10px] font-bold text-white'
            }
          >
            {cartCount}
          </span>
        )}
        <span className={compact ? 'text-[10px] font-medium' : ''}>{label}</span>
      </button>
    );
  }

  return (
    <Layout hideHeader hideBottomNav hideFooter>
      <div className={`dam-page min-h-screen bg-gray-50 ${activeTab === 'cart' || orderSuccess ? '' : cartCount > 0 ? 'pb-40 lg:pb-28' : 'pb-20 lg:pb-8'}`}>
        <div className="max-w-7xl mx-auto relative">
        {orderSuccess ? (
          <DamOrderDone
            info={orderSuccess}
            status={orderStatus}
            live={!orderSuccess.guest}
            deliveryTime={deliveryTimeLabel}
            maxBonusPercent={bonusRules.max_order_percent}
            restaurantPhone={settings.whatsapp_number || brandProfile?.whatsapp_phone || ''}
            formatPrice={formatPrice}
            onMenu={() => { setOrderSuccess(null); setActiveTab('menu'); }}
            onLogin={() => navigate(`/login?redirect=${encodeURIComponent('/cabinet')}`)}
            onWhatsApp={() => openWhatsAppForOrder(orderSuccess)}
          />
        ) : <>
        {activeTab !== 'cart' && <>
          <FoodStoreHeader>
          <div className={`dam-market-header__main ${PAGE_X}`}>
            <Link to="/" className="dam-market-icon-btn" aria-label={st("На главную Сортировка24")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <button type="button" className="dam-market-brand" onClick={() => setActiveTab('menu')}>
              <strong>{DAM_ALEM_BRAND}</strong>
              <span>{kitchenStatus.open ? st("Открыто · готовим сейчас") : st("Сейчас закрыто")}</span>
            </button>
            <div className="dam-market-search">
              <Search className="h-4 w-4" />
              <input
                type="search"
                value={searchQuery}
                onChange={event => {
                  setSearchQuery(event.target.value);
                  setActiveTab('menu');
                }}
                placeholder={st("Найти блюдо")}
                aria-label={st("Найти блюдо")}
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery('')} aria-label={st("Очистить поиск")}>
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <nav className="dam-market-desktop-nav" aria-label={st("Разделы {0}", [DAM_ALEM_BRAND])}>
              <button type="button" onClick={() => setActiveTab('menu')} className={activeTab === 'menu' ? 'is-active' : ''}>
                <LayoutGrid className="h-4 w-4" />  {st("Меню")} </button>
              <button type="button" onClick={() => setActiveTab('favorites')} className={activeTab === 'favorites' ? 'is-active' : ''}>
                <Heart className="h-4 w-4" />  {st("Избранное")} </button>
              <button type="button" onClick={() => setActiveTab('profile')} className={activeTab === 'profile' ? 'is-active' : ''}>
                <User className="h-4 w-4" />  {st("Профиль")} </button>
            </nav>
            <button type="button" className="dam-market-cart-button" onClick={() => setActiveTab('cart')} data-testid="dam-cart-open">
              <ShoppingCart className="h-5 w-5" />
              <span className="hidden sm:inline">{st("Корзина")}</span>
              {cartCount > 0 ? <b>{cartCount}</b> : null}
            </button>
          </div>
          <div className={`dam-market-header__meta ${PAGE_X}${effectiveAddress ? '' : ' dam-market-header__meta--empty'}`}>
            <span><MapPin className="h-4 w-4" />{effectiveAddress || st("Укажите адрес при оформлении")}</span>
            <span><Clock className="h-4 w-4" />{deliveryTimeLabel}</span>
            {freeDeliveryFrom > 0 ? <span className="hidden sm:flex"><Truck className="h-4 w-4" />{st("Бесплатно от")} {formatPrice(freeDeliveryFrom)}</span> : null}
          </div>
        </FoodStoreHeader>
        {!kitchenStatus.open ? (
          <div className={`${PAGE_X} dam-closed-note`}>
            <DamAlemStatusStrip
              kitchenOpen={false}
              kitchenMessage={kitchenStatus.message}
              deliveryTime={deliveryTimeLabel}
            />
          </div>
        ) : null}

        </>}
        {activeTab === 'menu' && (
          <main className="dam-market-menu">
            <div className={PAGE_X}>
              {!searchQuery.trim() && <>
              <section className="dam-menu-facts" aria-label={st("Условия доставки")}>
                <div>
                  <Clock className="h-5 w-5" aria-hidden="true" />
                  <span><strong>{deliveryTimeLabel}</strong><small>{st("до двери")}</small></span>
                </div>
                <div>
                  <Truck className="h-5 w-5" aria-hidden="true" />
                  <span>
                    <strong>{deliveryFromPrice === 0 ? st("Бесплатно") : mapDeliveryZones.length > 0 ? st("от {0}", [formatPrice(deliveryFromPrice)]) : formatPrice(deliveryFromPrice)}</strong>
                    <small>{freeDeliveryFrom > 0 ? st("доставка, бесплатно от {0}", [formatPrice(freeDeliveryFrom)]) : st("доставка")}</small>
                  </span>
                </div>
                <p className={kitchenStatus.open ? 'is-open' : 'is-closed'}>
                  {kitchenStatus.open ? st("Открыто до {0}", [kitchenStatus.closesAt]) : st("Закрыто · откроемся в {0}", [kitchenStatus.opensAt])}
                  {' · '}{String(settings.working_hours || `${kitchenStatus.opensAt} – ${kitchenStatus.closesAt}`)}
                </p>
              </section>

              {hitItems.length > 0 ? (
                <section id="alem-hits" className="dam-market-hits">
                  <div className="dam-market-section-head">
                    <div>
                      <h2>{st("Хиты")}</h2>
                    </div>
                  </div>
                  <div className="dam-market-hits__row">
                    {hitItems.map(item => (
                      <div key={`hit-${item.id}`} className="dam-market-hits__card">
                        <MenuDishRow item={item} variant="hero" />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="mt-3">
                <DamAlemPromoStrip
                  promos={configuredPromos}
                  freeDeliveryFrom={0}
                  formatPrice={formatPrice}
                  appliedCode={appliedPromo?.code}
                  onApply={code => void applyPromoByCode(code)}
                />
              </div>

              {promoBanners.length > 0 ? (
                <div className="mt-4">
                  <DamAlemPromoBanners banners={promoBanners} onAction={handleBannerAction} products={items} formatPrice={formatPrice} />
                </div>
              ) : null}

              {hasDeliveryZones ? (
                <details className="dam-delivery-details">
                  <summary>{st("Условия и зона доставки")}</summary>
                  <DeliveryZonesPreview
                    zones={mapDeliveryZones}
                    storeLat={storeLatNum}
                    storeLng={storeLngNum}
                    formatPrice={formatPrice}
                  />
                </details>
              ) : null}
              </>}
            </div>

            {!searchQuery.trim() && categoryPills.length > 0 ? (
              <DamAlemStickyPills
                id="dam-market-categories"
                pills={categoryPills}
                activeId={String(selectedCategoryId ?? menuCategorySections[0]?.category.id ?? '')}
                onSelect={id => { lastChipTap.current = Date.now(); openCatalog(Number(id)); }}
              />
            ) : null}

            <div id="dam-menu" className={`${PAGE_X} dam-market-feed`}>
              {searchQuery.trim() ? (
                <section>
                  <div className="dam-market-section-head">
                    <div>
                      <span>{st("Результаты поиска")}</span>
                      <h2>{poolItems.length > 0 ? st("Найдено: {0}", [poolItems.length]) : st("Ничего не найдено")}</h2>
                    </div>
                    <button type="button" onClick={() => setSearchQuery('')}>{st("Сбросить")}</button>
                  </div>
                  {poolItems.length > 0 ? (
                    <div className="dam-product-grid">
                      {poolItems.map(item => <MenuDishRow key={`search-${item.id}`} item={item} />)}
                    </div>
                  ) : (
                    <div className="dam-market-empty dam-market-empty--compact">
                      <Search className="h-8 w-8" />
                      <p>{st("Попробуйте другое название блюда.")}</p>
                    </div>
                  )}
                </section>
              ) : (
                menuCategorySections.map(({ category, items: sectionItems }) => (
                  <section key={category.id} id={`dam-category-${category.id}`} className="dam-market-category">
                    <div className="dam-market-section-head">
                      <div>
                        <h2>{category.name} <small className="dam-market-count" aria-hidden="true">{sectionItems.length}</small></h2>
                      </div>
                    </div>
                    <div className="dam-product-grid">
                      {sectionItems.map(item => <MenuDishRow key={`${category.id}-${item.id}`} item={item} />)}
                    </div>
                  </section>
                ))
              )}
            </div>
          </main>
        )}

        {activeTab === 'cart' && (cart.length === 0 ? (
          <main className="dam-os dam-os--empty">
            <h1>{st("Корзина пуста")}</h1>
            <p>{st("Выберите блюда в меню — «+» добавляет сразу.")}</p>
            <button type="button" className="dam-os-cta" onClick={() => setActiveTab('menu')}>{st("В меню")}</button>
          </main>
        ) : (
          <main className="dam-os" aria-labelledby="dam-os-title" data-testid="dam-order-screen">
            <header className="dam-os__head">
              <button type="button" className="dam-os-back" onClick={() => setActiveTab('menu')} aria-label={st("Назад в меню")}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <h1 id="dam-os-title">{st("Корзина")}</h1>
              <span>{st("{0} шт.", [cartCount])}</span>
            </header>

            {cartAvailabilityNotice && <div role="alert" className="dam-os-card dam-os-notice"><p>{cartAvailabilityNotice}</p><button type="button" className="dam-os-link" onClick={() => setCartAvailabilityNotice('')}>{st('Понятно')}</button></div>}

            {!loggedIn && (
              <section className="dam-os-guest" data-testid="dam-guest-banner">
                <p>{signInBonus > 0
                  ? st("Войдите за 10 секунд — с этого заказа спишем {0} {1}", [signInBonus, ruBonusNoun(signInBonus)])
                  : st("Войдите за 10 секунд — бонусы за заказ придут в кабинет")}</p>
                <button type="button" onClick={signInKeepingCart} data-testid="dam-guest-login">{st("Войти через Telegram или WhatsApp")}</button>
                <small>{st("Можно заказать и без входа")}</small>
              </section>
            )}

            <section className="dam-os-card">
              <OrderLines lines={cartLines} formatPrice={formatPrice} onQty={updateQuantity}
                onEdit={index => { setEditingCartIndex(index); setSelectedItem(cart[index].item); }} />
              {loyaltyGifts.length > 0 ? (
                <GiftRow
                  chosen={loyaltyGift?.title ?? null}
                  choiceCount={availableGiftChoices.length}
                  left={nextGift ? nextGift.min_amount - cartTotal : 0}
                  progress={nextGift ? percentOf(cartTotal, nextGift.min_amount) : 100}
                  formatPrice={formatPrice}
                  onChange={nextGiftChoice}
                  onBrowse={() => setActiveTab('menu')}
                />
              ) : null}
            </section>

            <section className="dam-os-card">
              <Segmented<'delivery' | 'pickup'> label={st("Способ получения")} value={deliveryMethod === 'dine_in' ? 'pickup' : deliveryMethod}
                options={[{ id: 'delivery', label: t('food.delivery') }, { id: 'pickup', label: t('food.pickup') }]}
                onChange={setDeliveryMethod} />
              {deliveryMethod === 'delivery' ? <>
                <SavedAddressBar currentAddress={deliveryAddress} onSelect={applySavedAddress} accent="orange" />
                <Field label={st("Адрес")} hint={addressStatus ? <p className={`dam-os-hint is-${addressStatus.tone}`} role="status">{addressStatus.text}</p> : null}>
                  {id => <div className="dam-os-address">
                    <input id={id} type="text" value={deliveryAddress} autoComplete="street-address" maxLength={300}
                      placeholder={st("Улица, дом, кв.")} onChange={e => setDeliveryAddress(e.target.value)} onBlur={quoteTypedAddress} />
                    <button type="button" onClick={() => void requestGeolocation()} disabled={deliveryQuoteLoading} aria-label={st("Определить адрес по GPS")}>
                      <Navigation className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>}
                </Field>
                <Disclosure label={st("Квартира, домофон, до двери")} defaultOpen={deliverToApartment}>
                  <Field label={st("Квартира, этаж, домофон")}>
                    {id => <input id={id} value={apartment} maxLength={200} onChange={e => setApartment(e.target.value)} placeholder={st("Например: кв. 42, 3 этаж")} />}
                  </Field>
                  <label className="dam-os-check">
                    <input type="checkbox" checked={deliverToApartment} onChange={e => setDeliverToApartment(e.target.checked)} />
                    <span>{st("Поднять до квартиры")} · {apartmentDeliveryPrice > 0 && !(apartmentFreeFrom > 0 && cartTotal >= apartmentFreeFrom) ? `+${formatPrice(apartmentDeliveryPrice)}` : st("бесплатно")}</span>
                  </label>
                </Disclosure>
              </> : <PickupCard />}
              {kitchenStatus.open
                ? <Disclosure label={st("Ко времени (предзаказ)")} defaultOpen={preorder}><PreorderFields enabled={preorder} value={schedule} onEnabled={setPreorder} onChange={setSchedule} /></Disclosure>
                : <PreorderFields enabled={preorder} value={schedule} onEnabled={setPreorder} onChange={setSchedule} />}
              <div className="dam-os-pair">
                <Field label={st("Имя")}>{id => <input id={id} value={customerName} maxLength={120} autoComplete="given-name" placeholder={st("Как к вам обращаться")} onChange={e => setCustomerName(e.target.value)} />}</Field>
                <Field label={st("Телефон")}>{id => <input id={id} type="tel" inputMode="tel" value={customerPhone} autoComplete="tel" placeholder="+7 7__ ___ __ __" onChange={e => setCustomerPhone(e.target.value)} />}</Field>
              </div>
              <div className="dam-os-field">
                <span className="dam-os-label">{st("Оплата")}</span>
                <Segmented<typeof payment> label={st("Оплата")} value={payment}
                  options={[{ id: 'cash', label: st("Наличными") }, { id: 'kaspi_qr', label: 'Kaspi' }, { id: 'halyk_qr', label: 'Halyk' }]}
                  onChange={setPayment} />
              </div>
              {payment === 'cash' ? <>
                <p className="dam-os-hint">{st("Оплата при получении")}</p>
                <Disclosure label={st("Нужна сдача?")} defaultOpen={cashGiven !== ''}><CashAmount total={checkoutGrandTotal} value={cashGiven} onChange={setCashGiven} /></Disclosure>
              </> : (
                <Field label={st("Номер для счёта в {0}", [PAYMENT_LABELS[payment]])}
                  hint={<p className="dam-os-hint">{st("Счёт на {0} придёт в приложение {1}. Готовить начнём сразу после оплаты.", [formatPrice(checkoutGrandTotal), PAYMENT_LABELS[payment]])}</p>}>
                  {id => <input id={id} type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7XX XXX XX XX" value={invoicePhone || customerPhone} onChange={e => setInvoicePhone(e.target.value)} />}
                </Field>
              )}
            </section>

            {maxBonusPoints > 0 ? (
              <BonusToggle points={maxBonusPoints} discount={Math.round(maxBonusPoints * bonusRules.tenge_rate)} on={useBonuses}
                maxPercent={BONUS_MAX_PERCENT} formatPrice={formatPrice} onToggle={setUseBonuses} />
            ) : null}

            <Disclosure label={appliedPromo ? st("Промокод {0}", [appliedPromo.code]) : st("Есть промокод?")} defaultOpen={!!appliedPromo} testId="dam-promo-toggle">
              <div className="dam-os-promo">
                <label className="sr-only" htmlFor="dam-promo">{st("Промокод")}</label>
                <input id="dam-promo" value={promoInput} disabled={!!appliedPromo} placeholder={st("Введите код")} onChange={e => setPromoInput(e.target.value.toUpperCase())} />
                {appliedPromo
                  ? <button type="button" onClick={() => { setAppliedPromo(null); setPromoInput(''); }}>{st("Сбросить")}</button>
                  : <button type="button" disabled={promoLoading || !promoInput.trim()} onClick={() => void applyPromoCode()}>{promoLoading ? '…' : st("Применить")}</button>}
              </div>
              {appliedPromo ? <p className="dam-os-hint is-ok" role="status">{appliedPromo.label}</p> : null}
            </Disclosure>
            <Disclosure label={st("Комментарий к заказу")} defaultOpen={!!comment}>
              <label className="sr-only" htmlFor="dam-comment">{t('food.comment')}</label>
              <textarea id="dam-comment" rows={2} maxLength={1000} value={comment} onChange={e => setComment(e.target.value)} placeholder={st("Домофон, подъезд, без лука…")} />
            </Disclosure>

            <SummaryRows rows={summaryRows} />
            <p className="dam-os-legal">
              {lang === 'kz' ? '«Тапсырыс беру» батырмасын басу арқылы сіз ' : 'Нажимая «Заказать», вы принимаете '}<Link to="/legal/food-terms" target="_blank" rel="noopener noreferrer">{lang === 'kz' ? 'тапсырыс шарттарын' : 'условия заказа'}</Link>{lang === 'kz' ? ' қабылдайсыз' : ''} · <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer">{lang === 'kz' ? 'Құпиялылық' : 'Конфиденциальность'}</Link> · {LEGAL_OPERATOR.name}, <a href={`tel:${LEGAL_OPERATOR.phoneHref}`}>{LEGAL_OPERATOR.phone}</a>
            </p>

            <footer className="dam-os-footer">
              {expectedCashback > 0 ? (
                <p className="dam-os-cashback" data-testid="dam-cashback">{loggedIn
                  ? st("После доставки вернём {0} {1}", [expectedCashback, ruBonusNoun(expectedCashback)])
                  : st("За этот заказ {0} {1} — если войти", [expectedCashback, ruBonusNoun(expectedCashback)])}</p>
              ) : null}
              {checkoutFinalBlockReason && !submitting ? <p className="dam-os-block" data-testid="dam-checkout-block-reason">{checkoutFinalBlockReason}</p> : null}
              <button type="button" className="dam-os-cta" disabled={submitting} onClick={() => void submitOrder()} data-testid="dam-checkout-submit">
                {submitting ? st("Отправляем заказ…") : st("Заказать · {0}", [formatPrice(checkoutGrandTotal)])}
              </button>
              {whatsappOrderHref ? (
                <a className="dam-os-wa" href={whatsappOrderHref} target="_blank" rel="noopener noreferrer" data-testid="dam-whatsapp-order"
                  onClick={() => track('order_whatsapp', { items: cart.length, total: checkoutGrandTotal })}>
                  <MessageSquare className="h-5 w-5" aria-hidden="true" />{st("Заказать через WhatsApp")}
                </a>
              ) : null}
            </footer>
          </main>
        ))}

        {activeTab === 'favorites' && (
          <div className={`${PAGE_X} py-4 md:py-6`}>
            <h2 className="hidden md:block font-bold text-gray-900 text-xl mb-4">{st("Избранное")}</h2>
            {favoriteItems.length === 0 ? (
              <div className="text-center py-16">
                <Heart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">{st("Нажмите ♥ на блюде, чтобы добавить в избранное")}</p>
              </div>
            ) : (
              <div className="dam-product-grid">
                {favoriteItems.map(item => (
                  <MenuDishRow key={`fav-${item.id}`} item={item} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <StoreProfileTab accentBg="bg-[#FF3B30] hover:bg-[#e6352b]" accentText="text-[#FF3B30]" />
        )}

        {activeTab !== 'cart' && (
          <DamCartBar count={cartCount} total={cartTotalWithService} goal={cartGoal} formatPrice={formatPrice} onOpen={() => setActiveTab('cart')} />
        )}

        {activeTab !== 'cart' && (
          <nav data-bottom-nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 safe-area-pb">
            <div className="flex max-w-7xl mx-auto">
              {DAM_NAV.map(({ id, icon, label }) => renderNavButton(id, icon, label, true))}
            </div>
          </nav>
        )}
        </>}
        </div>

        {/* ═══ PRODUCT POPUP MODAL ═══ */}
        {selectedItem && <MenuSelectionDialog product={productForSelection(selectedItem)}
          initial={editingCartIndex!=null?selectionOf(cart[editingCartIndex]):undefined}
          initialQuantity={editingCartIndex!=null?cart[editingCartIndex].quantity:1}
          confirmLabel={editingCartIndex!=null?'Сохранить изменения':'Добавить в корзину'}
          onClose={()=>{setSelectedItem(null);setEditingCartIndex(null);}}
          onConfirm={(value,quantity)=>{
            const selections:CartItemSelection={};value.modifiers.forEach(m=>{const o=modOptionsRef.current.find(x=>x.id===m.option_id);if(o)selections[o.group_id]=[...(selections[o.group_id] || []),...Array(m.quantity || 1).fill(m.option_id)];});
            const line:CartItem={item:selectedItem,quantity,selections,choices:value.choices};
            setCart(previous=>editingCartIndex!=null?previous.map((x,i)=>i===editingCartIndex?line:x):[...previous,line]);
            setSelectedItem(null);setEditingCartIndex(null);
          }}/>}

      </div>
    </Layout>
  );
}
