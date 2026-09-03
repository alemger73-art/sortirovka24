import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import {
  Plus, Minus, X, Utensils, Truck, Store,
  ChevronRight, MapPin, MessageSquare,
  ArrowLeft, Check, CheckCircle2,
  AlertCircle, Smartphone, Banknote, Coins, RotateCcw,
} from 'lucide-react';
import DamAlemOrderGuide from '@/components/damalem/DamAlemOrderGuide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { getAccountPrefill, isLoggedIn, pushCabinetItem, requireAuthDialog } from '@/lib/localAuth';
import { accountApi, getAccountToken } from '@/lib/accountApi';
import { fetchFoodRestaurantsList } from '@/lib/foodAdminApi';
import { apiUrl } from '@/lib/config';
import { findDamAlemRestaurantId } from '@/lib/damAlem';
import {
  saveFoodCart,
  loadFoodCart,
  clearFoodCartStorage,
  FOOD_MENU_VERSION_KEY,
} from '@/lib/foodCartStorage';
import { parseDeliveryZones, DEFAULT_STORE, type DeliveryZone } from '@/lib/gastronomDelivery';
import { fetchFoodDeliveryQuote, validateFoodPromo, type FoodDeliveryQuote } from '@/lib/foodDeliveryApi';
import {
  isLoyaltyEnabled,
  parseLoyaltyGifts,
  resolveLoyaltyGift,
  nextLoyaltyGift,
} from '@/lib/gastronomLoyalty';
import { GeolocationError, requestCurrentPosition } from '@/lib/geolocation';
import { isKitchenOpen } from '@/lib/foodWorkingHours';
import { loadFavoriteIds, saveFavoriteIds, toggleFavoriteId } from '@/lib/foodFavorites';
import DeliveryAddressPicker from '@/components/gastronom/DeliveryAddressPicker';
import SavedAddressBar from '@/components/SavedAddressBar';
import { type SavedAddress } from '@/lib/accountApi';
import LoyaltyGiftBanner from '@/components/gastronom/LoyaltyGiftBanner';
import OrderGoalsProgress from '@/components/damalem/OrderGoalsProgress';
import DeliveryZonesPreview from '@/components/damalem/DeliveryZonesPreview';
import DamAlemProductCard from '@/components/damalem/DamAlemProductCard';
import DamAlemFloatingCart from '@/components/damalem/DamAlemFloatingCart';
import DamAlemCartSidebar from '@/components/damalem/DamAlemCartSidebar';
import DamAlemStatusStrip from '@/components/damalem/DamAlemStatusStrip';
import DamAlemBrandHeader from '@/components/damalem/DamAlemBrandHeader';
import DamAlemStickyPills from '@/components/damalem/DamAlemStickyPills';
import { resolveDamAlemItemImage } from '@/lib/damAlemImages';
import DamAlemImage from '@/components/damalem/DamAlemImage';
import DamAlemSheet from '@/components/damalem/DamAlemSheet';
import DamAlemCheckoutButton from '@/components/damalem/DamAlemCheckoutButton';
import FoodOrderStatusBar from '@/components/damalem/FoodOrderStatusBar';
import { foodCheckoutBlockReason, publicOrderErrorMessage } from '@/lib/foodCheckoutGuards';
import { resolvePromoCodes } from '@/lib/damAlemMarketing';
import { buildDamAlemMenuSections, sectionDomId } from '@/lib/damAlemMenu';
import DamAlemPageSkeleton from '@/components/damalem/DamAlemPageSkeleton';
import LoadErrorState from '@/components/LoadErrorState';
import '@/styles/damAlem.css';

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
interface FoodItem {
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
  loyalty_enabled?: string; loyalty_gifts?: string;
  delivery_city?: string; delivery_area?: string;
  delivery_time?: string; working_hours?: string; promo_codes?: string;
  store_lat?: string; store_lng?: string;
  [key: string]: string | undefined;
}

const REPEAT_ORDER_KEY = 'damalem_repeat_order';
const LAST_ORDER_KEY = 'damalem_last_order_v1';
const APARTMENT_DELIVERY_FEE = 300;

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

interface OrderSuccessInfo {
  id: number;
  total: number;
  paymentLabel: string;
  paymentMethod: 'cash' | 'kaspi_qr' | 'halyk_qr';
  name: string;
  phone: string;
  address: string;
  deliveryMethod: 'delivery' | 'pickup';
}

const PAYMENT_LABELS: Record<'cash' | 'kaspi_qr' | 'halyk_qr', string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
};

interface CartItemSelection { [groupId: number]: number[]; }
interface CartItem { item: FoodItem; quantity: number; selections: CartItemSelection; }

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
  if (!w) return '200 г';
  if (/\d/.test(w) && (w.includes('г') || w.includes('кг') || w.includes('ml'))) return w;
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

export default function Food() {
  const navigate = useNavigate();
  const { t, localized, lang } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState('hits');
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [modGroups, setModGroups] = useState<ModifierGroup[]>([]);
  const [modOptions, setModOptions] = useState<ModifierOption[]>([]);
  const [itemGroupLinks, setItemGroupLinks] = useState<ItemModGroupLink[]>([]);
  const [settings, setSettings] = useState<Settings>({
    whatsapp_number: '+77470304096',
    hero_banner_title: 'DAM ALEM',
    hero_banner_subtitle: 'Доставка еды №1 в Сортировке',
    hero_banner_image: '',
    min_order_amount: '2000',
    delivery_price: '500',
    delivery_zones: '[]',
    show_recommendations: 'true',
  });
  const sectionObserverSkipRef = useRef(false);
  const cartHydratedRef = useRef(false);
  const menuVersionRef = useRef<string | null>(null);
  const modifiersLoadedRef = useRef(false);
  const modifiersLoadingRef = useRef<Promise<void> | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [lastOrderPreview, setLastOrderPreview] = useState<{
    label: string;
    order_items: string;
    delivery_address?: string;
    delivery_method?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [damAlemRestaurantId, setDamAlemRestaurantId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [currentSelections, setCurrentSelections] = useState<CartItemSelection>({});

  // Checkout form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [apartment, setApartment] = useState('');
  const [deliverToApartment, setDeliverToApartment] = useState(false);
  const [comment, setComment] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');
  const [orderSuccess, setOrderSuccess] = useState<OrderSuccessInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryQuote, setDeliveryQuote] = useState<FoodDeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const [addressFormCollapsed, setAddressFormCollapsed] = useState(false);
  const quoteRequestId = useRef(0);
  const addressPickerRef = useRef<HTMLDivElement>(null);
  const addressFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => loadFavoriteIds());
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number; free_delivery: boolean; label: string } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [useBonuses, setUseBonuses] = useState(false);
  const BONUS_MAX_PERCENT = 30;

  useEffect(() => { loadData(); }, []);

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
        label: parsed.label || 'Как в прошлый раз',
        order_items: parsed.order_items,
        delivery_address: parsed.delivery_address,
        delivery_method: parsed.delivery_method,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!checkoutOpen || !getAccountToken()) {
      setBonusBalance(0);
      setUseBonuses(false);
      return;
    }
    accountApi.me()
      .then((me) => setBonusBalance(Number(me?.bonus_balance || 0)))
      .catch(() => setBonusBalance(0));
  }, [checkoutOpen]);

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
    setCart(prev => {
      const byId = new Map(items.map(i => [i.id, i]));
      const next = prev
        .map(ci => {
          const fresh = byId.get(ci.item.id);
          if (!fresh || fresh.is_active === false || fresh.available === false) return null;
          return { ...ci, item: fresh };
        })
        .filter(Boolean) as CartItem[];
      return next.length === prev.length ? prev : next;
    });
  }, [items]);

  useEffect(() => {
    const prefill = getAccountPrefill();
    if (prefill.name) setCustomerName((v) => v || prefill.name);
    if (prefill.phone) setCustomerPhone((v) => v || prefill.phone);
  }, []);

  useEffect(() => () => {
    if (addressFocusTimerRef.current) clearTimeout(addressFocusTimerRef.current);
  }, []);

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

        setModGroups(
          extract(results[0])
            .filter((g: ModifierGroup) => g.is_active)
            .map((g: ModifierGroup) => ({
              ...g,
              type: g.type === 'single' ? 'radio' : (g.type === 'multiple' || g.type === 'quantity') ? 'checkbox' : g.type,
            })),
        );
        setModOptions(extract(results[1]).filter((o: ModifierOption) => o.is_active));
        setItemGroupLinks(extract(results[2]));
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
            .filter((p: any) => p.available !== false)
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
        cq('banners', () => client.entities.banners.query({ query: { active: true }, limit: 12 })),
      ]);
      const extract = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? (r.value?.data?.items || []) : []);

      const filterByRestaurant = <T extends { restaurant_id?: number | null }>(rows: T[]) =>
        rid != null ? rows.filter(r => r.restaurant_id == null || r.restaurant_id === rid) : rows;

      if (cats && foodItems) {
        setCategories(cats);
        setItems(foodItems);
      } else {
        const ecats: FoodCategory[] = filterByRestaurant(extract(results[0]) as FoodCategory[]).filter((c: FoodCategory) => {
          if (c.is_active === false) return false;
          const t = String(c.category_type || '').toLowerCase();
          return t !== 'delivery' && t !== 'seasonal' && t !== 'service';
        });
        const eitems: FoodItem[] = filterByRestaurant(extract(results[1]) as FoodItem[])
          .filter((i: FoodItem) => i.is_active !== false && (i as FoodItem & { available?: boolean }).available !== false)
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

      void loadModifiers(true);
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

  const poolItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => {
      const name = (localized(i, 'name') || i.name || '').toLowerCase();
      const desc = (localized(i, 'description') || i.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [items, searchQuery, localized]);

  const menuSections = useMemo(
    () =>
      buildDamAlemMenuSections(categories, poolItems, {
        categorySlugOf,
      }),
    [categories, poolItems],
  );

  const stickyPills = useMemo(
    () => menuSections.map(s => ({ id: s.id, label: s.label })),
    [menuSections],
  );

  const uiStep: 1 | 2 | 3 = checkoutOpen ? 3 : cartOpen ? 2 : 1;

  const availablePromos = useMemo(
    () => resolvePromoCodes(settings.promo_codes),
    [settings.promo_codes],
  );

  const showRecommendations = settings.show_recommendations !== 'false';

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    sectionObserverSkipRef.current = true;
    const el = document.getElementById(sectionDomId(sectionId));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      sectionObserverSkipRef.current = false;
    }, 700);
  }, []);

  useEffect(() => {
    if (menuSections.length === 0) return;
    const nodes = menuSections
      .map(s => document.getElementById(sectionDomId(s.id)))
      .filter(Boolean) as HTMLElement[];
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        if (sectionObserverSkipRef.current) return;
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top?.target?.id) return;
        const id = top.target.id.replace(/^dam-section-/, '');
        if (id) setActiveSectionId(id);
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0.15, 0.35, 0.55] },
    );
    nodes.forEach(n => observer.observe(n));
    return () => observer.disconnect();
  }, [menuSections]);

  // Get modifier groups for a food item
  const getGroupsForItem = useCallback((itemId: number): ModifierGroup[] => {
    const groupIds = itemGroupLinks
      .filter(l => l.food_item_id === itemId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(l => l.modifier_group_id);
    return groupIds.map(gid => modGroups.find(g => g.id === gid)).filter(Boolean) as ModifierGroup[];
  }, [itemGroupLinks, modGroups]);

  const getOptionsForGroup = useCallback((groupId: number): ModifierOption[] => {
    return modOptions
      .filter(o => o.group_id === groupId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [modOptions]);

  const itemHasGroups = useCallback((itemId: number): boolean => {
    return itemGroupLinks.some(l => l.food_item_id === itemId);
  }, [itemGroupLinks]);

  function calcSelectionsPrice(selections: CartItemSelection): number {
    let total = 0;
    for (const groupId of Object.keys(selections)) {
      const optionIds = selections[Number(groupId)];
      for (const optId of optionIds) {
        const opt = modOptions.find(o => o.id === optId);
        if (opt) total += opt.price;
      }
    }
    return total;
  }

  function validateSelections(itemId: number, selections: CartItemSelection): { valid: boolean; errors: string[] } {
    const itemGroups = getGroupsForItem(itemId);
    const errors: string[] = [];
    for (const group of itemGroups) {
      const selected = selections[group.id] || [];
      if (group.is_required && selected.length === 0) {
        errors.push(`${t('food.selectRequired')}: ${localized(group, 'name') || group.name}`);
      }
      if (group.type === 'radio' && group.is_required && selected.length !== 1) {
        errors.push(`${t('food.chooseOne')}: ${localized(group, 'name') || group.name}`);
      }
      if (group.type === 'checkbox') {
        if (group.min_select > 0 && selected.length < group.min_select) {
          errors.push(`Мин. ${group.min_select} — "${localized(group, 'name') || group.name}"`);
        }
        if (group.max_select > 0 && selected.length > group.max_select) {
          errors.push(`Макс. ${group.max_select} — "${localized(group, 'name') || group.name}"`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function getSelectionNames(selections: CartItemSelection): string[] {
    const names: string[] = [];
    for (const groupId of Object.keys(selections)) {
      const optionIds = selections[Number(groupId)];
      for (const optId of optionIds) {
        const opt = modOptions.find(o => o.id === optId);
        if (opt) names.push(opt.name);
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
    return sum + (ci.item.price + modTotal) * ci.quantity;
  }, 0), [cart, modOptions]);

  const cartCount = useMemo(() => cart.reduce((sum, ci) => sum + ci.quantity, 0), [cart]);
  const serviceFeeRate = useMemo(() => {
    const raw = settings.service_fee_rate;
    if (raw == null || raw === '') return 0.1;
    const v = parseFloat(raw);
    if (Number.isNaN(v)) return 0.1;
    return v > 1 ? v / 100 : v;
  }, [settings.service_fee_rate]);
  const serviceFeeAmount = useMemo(() => Math.round(cartTotal * serviceFeeRate), [cartTotal, serviceFeeRate]);
  const cartTotalWithService = cartTotal + serviceFeeAmount;
  const serviceFeePercent = Math.round(serviceFeeRate * 100);
  const serviceFeeLabel = `${t('food.serviceFeeBase')} (${serviceFeePercent}%)`;

  const cartSidebarLines = useMemo(
    () =>
      cart.map((ci) => {
        const modTotal = calcSelectionsPrice(ci.selections);
        const selNames = getSelectionNames(ci.selections);
        return {
          name: ci.item.name,
          quantity: ci.quantity,
          linePrice: (ci.item.price + modTotal) * ci.quantity,
          image: getItemImage(ci.item),
          modifiers: selNames.length > 0 ? `+ ${selNames.join(', ')}` : undefined,
        };
      }),
    [cart],
  );

  const freeDeliveryFrom = useMemo(
    () => Number(settings.free_delivery_from || 15000),
    [settings.free_delivery_from],
  );
  const loyaltyGifts = useMemo(
    () => (isLoyaltyEnabled(settings) ? parseLoyaltyGifts(settings.loyalty_gifts) : []),
    [settings.loyalty_gifts, settings.loyalty_enabled],
  );
  const loyaltyGift = useMemo(
    () => resolveLoyaltyGift(cartTotal, loyaltyGifts),
    [cartTotal, loyaltyGifts],
  );
  const nextGift = useMemo(
    () => nextLoyaltyGift(cartTotal, loyaltyGifts),
    [cartTotal, loyaltyGifts],
  );

  const kitchenStatus = useMemo(() => isKitchenOpen(settings), [settings]);
  const deliveryTimeLabel = settings.delivery_time || brandProfile?.delivery_time || '35–45 мин';

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
        setDeliveryAddress(quote.display_address);
      }
      if (quote.location_warning) {
        setDeliveryQuoteError(quote.location_warning);
        if (options?.notify) toast.warning(quote.location_warning);
      } else if (!quote.available) {
        const msg = quote.message || 'Доставка по этому адресу недоступна';
        setDeliveryQuoteError(msg);
        if (options?.notify) toast.error(msg);
      }
    } catch (e) {
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(null);
      const msg = e instanceof Error ? e.message : 'Не удалось рассчитать доставку';
      setDeliveryQuoteError(msg);
      if (options?.notify) toast.error(msg);
    } finally {
      if (reqId === quoteRequestId.current) setDeliveryQuoteLoading(false);
    }
  }, [cartTotal]);

  const findByAddress = useCallback((addr?: string) => {
    const target = (addr ?? effectiveAddress).trim();
    if (target.length < 5) {
      toast.info('Введите улицу и номер дома, например: пер. Урановый 10');
      return;
    }
    if (addr) setDeliveryAddress(addr);
    void runDeliveryQuote({ address: target }, { notify: true });
  }, [effectiveAddress, runDeliveryQuote]);

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
          toast.error('Разрешите доступ к геолокации в настройках телефона');
        } else {
          toast.error('Не удалось получить GPS. Введите адрес вручную.');
        }
        return;
      }
      toast.error('Не удалось получить GPS. Введите адрес вручную.');
    }
  }, [runDeliveryQuote]);

  const applySavedAddress = useCallback((saved: SavedAddress, opts?: { auto?: boolean }) => {
    setDeliveryAddress(saved.address);
    void runDeliveryQuote(
      saved.lat != null && saved.lng != null
        ? { address: saved.address, lat: saved.lat, lng: saved.lng }
        : { address: saved.address },
      { notify: !opts?.auto },
    );
  }, [runDeliveryQuote]);

  const focusAddressPicker = useCallback(() => {
    setAddressFormCollapsed(false);
    if (addressFocusTimerRef.current) clearTimeout(addressFocusTimerRef.current);
    addressFocusTimerRef.current = setTimeout(() => {
      addressFocusTimerRef.current = null;
      addressPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = addressPickerRef.current?.querySelector('input');
      if (input instanceof HTMLInputElement) {
        input.focus({ preventScroll: true });
        input.select();
      }
    }, 150);
  }, []);

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

  const activeDeliveryPrice = useMemo(() => {
    if (deliveryMethod !== 'delivery') return 0;
    if (promoFreeDelivery || cartTotal >= freeDeliveryFrom) return 0;
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

  const apartmentValid = !deliverToApartment || apartment.trim().length > 0;

  const deliveryUnavailableMessage = useMemo(() => {
    if (deliveryMethod !== 'delivery' || deliveryQuoteLoading) return null;
    if (deliveryQuote?.location_warning) return deliveryQuote.location_warning;
    if (deliveryQuote && deliveryQuote.available === false) {
      return deliveryQuote.message || 'Адрес вне зоны доставки';
    }
    return null;
  }, [deliveryMethod, deliveryQuoteLoading, deliveryQuote]);

  const checkoutBlockReason = useMemo(() => {
    return foodCheckoutBlockReason({
      kitchenOpen: kitchenStatus.open,
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
      loggedIn: isLoggedIn(),
    });
  }, [
    kitchenStatus, cartTotal, minOrder, deliveryMethod, deliveryReady, deliveryQuoteLoading,
    deliveryQuote, effectiveAddress, deliveryQuoteError, deliveryUnavailableMessage,
    deliverToApartment, apartment, customerName, customerPhone, getAccountToken(),
  ]);

  const openCheckout = useCallback(() => {
    if (minOrder > 0 && cartTotal < minOrder) {
      toast.error(`Минимальная сумма заказа — ${minOrder.toLocaleString('ru-RU')} ₸`);
      return;
    }
    setCartOpen(false);
    setCheckoutStep(1);
    setCheckoutOpen(true);
    setAddressFormCollapsed(deliveryReady);
    const addr = effectiveAddress.trim();
    if (deliveryMethod === 'delivery' && addr.length >= 5 && !deliveryQuote && !deliveryQuoteLoading) {
      void runDeliveryQuote({ address: addr });
    }
  }, [deliveryReady, effectiveAddress, deliveryMethod, deliveryQuote, deliveryQuoteLoading, runDeliveryQuote, minOrder, cartTotal]);

  const apartmentDeliveryFee = useMemo(
    () => (deliveryMethod === 'delivery' && deliverToApartment ? APARTMENT_DELIVERY_FEE : 0),
    [deliveryMethod, deliverToApartment],
  );

  /** Сумма к оплате до списания бонусов */
  const checkoutTotalBeforeBonus = useMemo(() => {
    const base = deliveryMethod === 'delivery'
      ? cartTotalWithService + activeDeliveryPrice + apartmentDeliveryFee
      : cartTotalWithService;
    return Math.max(0, base - promoDiscountAmount);
  }, [deliveryMethod, cartTotalWithService, activeDeliveryPrice, apartmentDeliveryFee, promoDiscountAmount]);

  const maxBonusPoints = useMemo(() => {
    if (!getAccountToken() || bonusBalance <= 0 || appliedPromo) return 0;
    const capBySubtotal = Math.floor(cartTotal * (BONUS_MAX_PERCENT / 100));
    return Math.max(0, Math.min(bonusBalance, capBySubtotal, checkoutTotalBeforeBonus));
  }, [bonusBalance, cartTotal, checkoutTotalBeforeBonus, appliedPromo]);

  const bonusDiscountAmount = useMemo(
    () => (useBonuses && maxBonusPoints > 0 ? maxBonusPoints : 0),
    [useBonuses, maxBonusPoints],
  );

  /** Сумма к оплате: позиции + сервис + доставка + до квартиры − промокод − бонусы */
  const checkoutGrandTotal = useMemo(
    () => Math.max(0, checkoutTotalBeforeBonus - bonusDiscountAmount),
    [checkoutTotalBeforeBonus, bonusDiscountAmount],
  );

  const cartBarLabel = useMemo(() => {
    const n = cartCount;
    if (lang === 'kz') {
      return `${n} тауам`;
    }
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} товар`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} товара`;
    return `${n} товаров`;
  }, [cartCount, lang]);

  function getItemQuantityInCart(itemId: number) {
    return cart.filter(ci => ci.item.id === itemId).reduce((s, ci) => s + ci.quantity, 0);
  }

  // Get suggestions for "Дополнить заказ" section
  const cartSuggestions = useMemo(() => {
    if (cart.length === 0) return [];
    const cartItemIds = new Set(cart.map(ci => ci.item.id));
    const cartCategoryIds = new Set(cart.map(ci => ci.item.category_id));

    const suggestCategories = categories.filter(c => {
      const name = c.name.toLowerCase();
      const slug = (c.slug || '').toLowerCase();
      return (
        name.includes('напит') ||
        name.includes('соус') ||
        name.includes('снек') ||
        name.includes('десерт') ||
        name.includes('фри') ||
        slug.includes('napitk') ||
        slug.includes('sous') ||
        slug.includes('snek')
      );
    });
    const suggestCatIds = new Set(suggestCategories.map(c => c.id));

    const hasDrink = cart.some(ci => {
      const cat = categories.find(c => c.id === ci.item.category_id);
      const n = `${cat?.name || ''} ${cat?.slug || ''}`.toLowerCase();
      return n.includes('напит') || n.includes('drink') || n.includes('napitk');
    });
    const hasSauce = cart.some(ci => {
      const cat = categories.find(c => c.id === ci.item.category_id);
      const n = `${cat?.name || ''} ${cat?.slug || ''}`.toLowerCase();
      return n.includes('соус') || n.includes('sauce');
    });

    const goalTarget =
      freeDeliveryFrom > 0 && cartTotal < freeDeliveryFrom
        ? freeDeliveryFrom
        : nextGift && cartTotal < nextGift.min_amount
          ? nextGift.min_amount
          : minOrder > 0 && cartTotal < minOrder
            ? minOrder
            : 0;
    const gap = goalTarget > cartTotal ? goalTarget - cartTotal : 0;

    const candidates = items.filter(i => !cartItemIds.has(i.id) && i.is_active !== false);
    const scored = candidates.map(i => {
      let score = 0;
      if (i.is_recommended || i.is_popular) score += 3;
      if (suggestCatIds.has(i.category_id)) score += 4;
      if (!hasDrink && suggestCategories.some(c => c.id === i.category_id && /напит|drink|napitk/i.test(`${c.name} ${c.slug || ''}`))) {
        score += 5;
      }
      if (!hasSauce && suggestCategories.some(c => c.id === i.category_id && /соус|sauce/i.test(`${c.name} ${c.slug || ''}`))) {
        score += 4;
      }
      if (gap > 0 && i.price > 0 && i.price <= gap + 500 && i.price >= gap * 0.4) score += 6;
      if (cartCategoryIds.has(i.category_id)) score += 1;
      return { item: i, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6).map(s => s.item);
  }, [cart, items, categories, cartTotal, freeDeliveryFrom, nextGift, minOrder]);

  const floatingGoal = useMemo(() => {
    type G = { label: string; remaining: number; target: number };
    const goals: G[] = [];
    if (minOrder > 0 && cartTotal < minOrder) {
      goals.push({
        label: `Ещё ${formatPrice(minOrder - cartTotal)} до минимального заказа`,
        remaining: minOrder - cartTotal,
        target: minOrder,
      });
    }
    if (freeDeliveryFrom > 0 && cartTotal < freeDeliveryFrom) {
      goals.push({
        label: `Ещё ${formatPrice(freeDeliveryFrom - cartTotal)} до бесплатной доставки`,
        remaining: freeDeliveryFrom - cartTotal,
        target: freeDeliveryFrom,
      });
    }
    if (nextGift && cartTotal < nextGift.min_amount) {
      goals.push({
        label: `Ещё ${formatPrice(nextGift.min_amount - cartTotal)} — ${nextGift.title}`,
        remaining: nextGift.min_amount - cartTotal,
        target: nextGift.min_amount,
      });
    }
    const active = goals.sort((a, b) => a.remaining - b.remaining)[0];
    if (!active) {
      return { percent: 100, label: 'Все бонусы активны' as string | undefined };
    }
    return {
      percent: Math.min(100, Math.round((cartTotal / active.target) * 100)),
      label: active.label,
    };
  }, [cartTotal, minOrder, freeDeliveryFrom, nextGift]);

  function addToCart(item: FoodItem, selections: CartItemSelection = {}) {
    setCart(prev => {
      const key = selectionsKey(selections);
      const existing = prev.find(ci => ci.item.id === item.id && selectionsKey(ci.selections) === key);
      if (existing) return prev.map(ci => ci === existing ? { ...ci, quantity: ci.quantity + 1 } : ci);
      return [...prev, { item, quantity: 1, selections }];
    });
    toast.success(
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <p className="font-semibold text-sm">{localized(item, 'name') || item.name}</p>
          <p className="text-xs text-gray-500">{t('food.addToCart')}</p>
        </div>
      </div>,
      { duration: 1500 }
    );
  }

  async function quickAdd(item: FoodItem) {
    await loadModifiers();
    if (itemHasGroups(item.id)) {
      openItemModal(item);
    } else {
      addToCart(item, {});
    }
  }

  async function openItemModal(item: FoodItem) {
    await loadModifiers();
    setSelectedItem(item);
    const groups = getGroupsForItem(item.id);
    const defaults: CartItemSelection = {};
    for (const group of groups) {
      if (group.type === 'radio' && group.is_required) {
        const opts = getOptionsForGroup(group.id);
        if (opts.length > 0) defaults[group.id] = [opts[0].id];
      } else {
        defaults[group.id] = [];
      }
    }
    setCurrentSelections(defaults);
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
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: updated[index].quantity + delta };
      if (updated[index].quantity <= 0) updated.splice(index, 1);
      return updated;
    });
  }

  function removeCartLine(index: number) {
    setCart(prev => prev.filter((_, i) => i !== index));
  }

  function handleRadioSelect(groupId: number, optionId: number) {
    setCurrentSelections(prev => ({ ...prev, [groupId]: [optionId] }));
  }

  function handleCheckboxToggle(groupId: number, optionId: number, maxSelect: number) {
    setCurrentSelections(prev => {
      const current = prev[groupId] || [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter(id => id !== optionId) };
      }
      if (maxSelect > 0 && current.length >= maxSelect) {
        toast.error(`Максимум ${maxSelect} выбора`);
        return prev;
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  function confirmAddWithSelections() {
    if (!selectedItem) return;
    const { valid, errors } = validateSelections(selectedItem.id, currentSelections);
    if (!valid) { toast.error(errors[0]); return; }
    const cleanSelections: CartItemSelection = {};
    for (const [gid, opts] of Object.entries(currentSelections)) {
      if (opts.length > 0) cleanSelections[Number(gid)] = opts;
    }
    addToCart(selectedItem, cleanSelections);
    setSelectedItem(null);
    setCurrentSelections({});
  }

  async function submitOrder() {
    if (submitting) return;
    const block = foodCheckoutBlockReason({
      kitchenOpen: kitchenStatus.open,
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
      loggedIn: isLoggedIn(),
    });
    if (block) {
      toast.error(block);
      if (!isLoggedIn()) requireAuthDialog(navigate);
      return;
    }
    if (!requireAuthDialog(navigate)) return;

    const aptPart = apartment.trim() ? `, кв. ${apartment.trim()}` : '';
    const toAptNote = deliverToApartment ? ' (до квартиры)' : ' (до подъезда)';
    const fullAddress = deliveryMethod === 'delivery'
      ? `${deliveryQuote?.display_address || effectiveAddress}${aptPart}${toAptNote}`
      : '';

    const aptFeeNote = deliverToApartment ? `\n🚪 Доставка до квартиры: +${APARTMENT_DELIVERY_FEE} ₸` : '';
    const giftNote = loyaltyGift ? `\n🎁 Подарок: ${loyaltyGift.title}` : '';
    const promoNote = appliedPromo ? `\n🏷 Промокод ${appliedPromo.code}: ${appliedPromo.label}` : '';
    const bonusNote = bonusDiscountAmount > 0 ? `\n🪙 Бонусы: −${bonusDiscountAmount} ₸` : '';
    const orderComment = (comment.trim() + aptFeeNote + giftNote + promoNote + bonusNote).trim();

    const orderItems = cart.map(ci => {
      const mods: { name: string; price: number; option_id: number }[] = [];
      for (const gid of Object.keys(ci.selections)) {
        for (const optId of ci.selections[Number(gid)] || []) {
          const opt = modOptions.find(o => o.id === optId);
          if (opt) mods.push({ name: opt.name, price: opt.price || 0, option_id: opt.id });
        }
      }
      const modTotal = calcSelectionsPrice(ci.selections);
      return {
        id: ci.item.id,
        name: ci.item.name,
        price: ci.item.price,
        quantity: ci.quantity,
        modifiers: mods,
        modTotal,
      };
    });
    const total = checkoutGrandTotal;
    const paymentLabel = PAYMENT_LABELS[payment];
    setSubmitting(true);
    try {
      const created = await withRetry(() =>
        client.entities.food_orders.create({
          data: {
            restaurant_id: damAlemRestaurantId ?? 1,
            restaurant_name: settings.hero_banner_title || brandProfile?.name || 'DAM ALEM',
            restaurant_phone: settings.whatsapp_number || brandProfile?.whatsapp_phone || '',
            order_items: JSON.stringify(orderItems),
            total_amount: total,
            delivery_fee: deliveryMethod === 'delivery' ? activeDeliveryPrice : 0,
            service_fee: serviceFeeAmount,
            ...(appliedPromo?.code ? { promo_code: appliedPromo.code } : {}),
            ...(bonusDiscountAmount > 0 ? { bonus_points_to_use: bonusDiscountAmount } : {}),
            ...(apartmentDeliveryFee > 0 ? { apartment_delivery_fee: apartmentDeliveryFee } : {}),
            ...(deliveryMethod === 'delivery' && deliveryQuote?.lat != null && deliveryQuote?.lng != null
              ? { delivery_lat: deliveryQuote.lat, delivery_lng: deliveryQuote.lng }
              : {}),
            customer_name: customerName,
            customer_phone: customerPhone,
            delivery_address: fullAddress,
            comment: orderComment,
            delivery_method: deliveryMethod,
            payment_method: payment,
          },
        })
      );
      const createdAny = created as { data?: { id?: number }; id?: number } | undefined;
      const orderId = Number(createdAny?.data?.id ?? createdAny?.id ?? 0);
      const orderItemsSnapshot = JSON.stringify(
        cart.map(ci => ({
          id: ci.item.id,
          name: ci.item.name,
          price: ci.item.price,
          quantity: ci.quantity,
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
        subtitle: deliveryMethod === 'delivery' ? fullAddress : 'Самовывоз',
        status: 'Новый',
      });
      clearFoodCartStorage();
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      setCheckoutStep(1);
      setOrderSuccess({
        id: orderId,
        total,
        paymentLabel,
        paymentMethod: payment,
        name: customerName,
        phone: customerPhone,
        address: deliveryMethod === 'delivery' ? fullAddress : 'Самовывоз',
        deliveryMethod,
      });
      setCustomerName('');
      setCustomerPhone('');
      setApartment('');
      setDeliveryAddress('');
      setDeliveryQuote(null);
      setComment('');
      setDeliverToApartment(false);
      setPayment('cash');
    } catch (e) {
      console.error('Error creating order:', e);
      toast.error(publicOrderErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function openWhatsAppForOrder(info: OrderSuccessInfo) {
    const whatsappNumber = settings.whatsapp_number.replace(/[^0-9]/g, '');
    let msg = `🍽 *DAM ALEM — заказ #${info.id || '—'}*\n\n👤 ${info.name}\n📞 ${info.phone}\n`;
    if (info.deliveryMethod === 'delivery') {
      msg += `📍 ${info.address}\n`;
    } else {
      msg += `🏪 Самовывоз\n`;
    }
    msg += `💳 Оплата: ${info.paymentLabel}\n`;
    msg += `\n*Итого: ${info.total.toLocaleString('ru-RU')} ₸*`;
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function formatPrice(price: number) { return price.toLocaleString('ru-RU') + ' ₸'; }
  function getItemImage(item: FoodItem): string {
    return resolveDamAlemItemImage({
      id: item.id,
      name: localized(item, 'name') || item.name,
      categorySlug: item.category_slug || categorySlugOf(
        categories.find(c => c.id === item.category_id) || { id: item.category_id, name: '', slug: '' },
      ),
      imageUrl: item.image_url,
    });
  }

  function getBadgeType(item: FoodItem): 'hit' | 'new' | null {
    if (item.is_popular || item.is_recommended) return 'hit';
    if ((item.sort_order ?? 99) <= 3) return 'new';
    return null;
  }

  const modalTotalPrice = selectedItem ? selectedItem.price + calcSelectionsPrice(currentSelections) : 0;
  const modalValidation = selectedItem ? validateSelections(selectedItem.id, currentSelections) : { valid: true, errors: [] };
  const selectedItemBadge = selectedItem ? getBadgeType(selectedItem) : null;

  const deliveryFromPrice = useMemo(() => {
    if (mapDeliveryZones.length > 0) {
      return Math.min(...mapDeliveryZones.map(z => z.price));
    }
    return parseInt(settings.delivery_price) || 0;
  }, [mapDeliveryZones, settings.delivery_price]);

  const guideZones = useMemo(
    () => mapDeliveryZones.map(z => ({ name: z.name, price: z.price })),
    [mapDeliveryZones],
  );

  function toggleFavorite(itemId: number) {
    const next = toggleFavoriteId(itemId);
    setFavoriteIds(next);
    saveFavoriteIds(next);
  }

  async function applyPromoCode() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoLoading(true);
    try {
      const result = await validateFoodPromo({ code, cart_subtotal: cartTotal });
      setAppliedPromo({
        code: result.code,
        discount: result.discount,
        free_delivery: result.free_delivery,
        label: result.label,
      });
      setUseBonuses(false);
      toast.success(`Промокод ${result.code} применён`);
    } catch (e) {
      setAppliedPromo(null);
      toast.error(e instanceof Error ? e.message : 'Промокод недействителен');
    } finally {
      setPromoLoading(false);
    }
  }

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
      applyRepeatPayload(payload);
    } catch {
      /* ignore */
    }
  }, [items]);

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
      lines.push({ item: fresh, quantity: qty, selections: {} });
    }
    if (lines.length > 0) {
      setCart(lines);
      toast.success('Заказ добавлен в корзину — можно оформить снова');
      setCartOpen(true);
    }
    if (payload.delivery_address) setDeliveryAddress(payload.delivery_address);
    if (payload.delivery_method === 'pickup') setDeliveryMethod('pickup');
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
        description={variant === 'row' ? (desc || undefined) : undefined}
        priceLabel={formatPrice(item.price)}
        imageUrl={getItemImage(item)}
        qtyInCart={qtyInCart}
        hasOptions={hasGroups}
        optionsLabel={t('food.hasOptions')}
        isFavorite={favoriteIds.includes(item.id)}
        weight={w !== '200 г' ? w : undefined}
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
      <Layout>
        <DamAlemPageSkeleton />
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout>
        <LoadErrorState onRetry={() => loadData()} />
      </Layout>
    );
  }

  const brandDescription = (brandProfile?.description || settings.hero_banner_subtitle || '').trim();

  const orderPaymentHint = orderSuccess
    ? orderSuccess.paymentMethod === 'cash'
      ? t('food.guide.payCash')
      : orderSuccess.paymentMethod === 'kaspi_qr'
        ? t('food.guide.payKaspi')
        : t('food.guide.payHalyk')
    : '';

  return (
    <Layout>
      <div className="dam-page min-h-screen">
        {orderSuccess && (
          <DamAlemSheet open bare overlayClassName="sm:items-center" onClose={() => setOrderSuccess(null)}>
            <div className="dam-success-modal">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="dam-section-title text-zinc-900">Заказ принят!</h2>
                {orderSuccess.id > 0 && (
                  <p className="mt-1 text-sm font-semibold text-[#FF3B30]">№ {orderSuccess.id}</p>
                )}
                <p className="mt-2 max-w-sm text-sm text-gray-500">
                  Готовим после подтверждения · ориентир {deliveryTimeLabel}
                </p>
              </div>
              <div className="mt-4 dam-card p-4">
                <FoodOrderStatusBar status="new" />
              </div>
              <div className="mt-4 space-y-2 dam-card p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Сумма</span>
                  <span className="font-bold">{formatPrice(orderSuccess.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Оплата</span>
                  <span className="font-semibold">{orderSuccess.paymentLabel}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Адрес</span>
                  <span className="text-right font-medium">{orderSuccess.address}</span>
                </div>
              </div>
              {orderSuccess.paymentMethod !== 'cash' && (
                <div className="mt-4 rounded-2xl border border-gray-100 p-4 text-center">
                  <p className="text-sm font-semibold text-gray-800">{orderSuccess.paymentLabel}</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`DAMALEM:${orderSuccess.id};TOTAL:${orderSuccess.total};PAY:${orderSuccess.paymentMethod}`)}`}
                    alt="QR оплаты"
                    className="mx-auto mt-3 h-48 w-48 rounded-xl ring-1 ring-gray-100"
                  />
                  <p className="mt-2 text-xs text-gray-400">Покажите QR при получении заказа</p>
                </div>
              )}
              {orderPaymentHint && (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-4">
                  <p className="text-sm font-semibold text-[#111111] mb-1">{t('food.guide.howToPay')}</p>
                  <p className="text-sm text-[#555555] leading-relaxed">{orderPaymentHint}</p>
                </div>
              )}
              <div className="mt-5 space-y-2">
                {orderSuccess.deliveryMethod === 'delivery' && orderSuccess.id > 0 && (
                  <Link
                    to={`/delivery/food/${orderSuccess.id}`}
                    className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#FF3B30] text-sm font-bold text-white"
                    onClick={() => setOrderSuccess(null)}
                  >
                    Отследить заказ
                  </Link>
                )}
                <Link
                  to="/cabinet"
                  className="dam-btn-primary text-sm"
                  onClick={() => setOrderSuccess(null)}
                >
                  Мои заказы
                </Link>
                <button
                  type="button"
                  onClick={() => openWhatsAppForOrder(orderSuccess)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-green-200 bg-green-50 text-sm font-semibold text-green-700"
                >
                  <MessageSquare className="h-4 w-4" />
                  Написать в WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setOrderSuccess(null)}
                  className="h-10 w-full text-sm font-medium text-gray-500"
                >
                  Вернуться в меню
                </button>
              </div>
            </div>
          </DamAlemSheet>
        )}
        <DamAlemStatusStrip
          kitchenOpen={kitchenStatus.open}
          kitchenMessage={kitchenStatus.message}
          deliveryTime={deliveryTimeLabel}
          freeDeliveryLabel={
            freeDeliveryFrom > 0 ? `бесплатно от ${formatPrice(freeDeliveryFrom)}` : undefined
          }
          offerLabel={
            availablePromos[0]
              ? availablePromos[0].label || availablePromos[0].code
              : undefined
          }
        />

        <div
          className={`dam-page-shell w-full px-4 pb-32 pt-3 sm:px-6 lg:px-10 lg:pt-5 xl:px-12${
            cartCount > 0 && !checkoutOpen ? ' dam-page-shell--with-sidebar' : ''
          }`}
        >
          <div className="dam-page-main space-y-5 lg:space-y-6">
            <DamAlemBrandHeader
              title={settings.hero_banner_title || brandProfile?.name || t('food.heroTitle')}
              subtitle={settings.hero_banner_subtitle || t('food.heroSubtitle')}
              heroImage={settings.hero_banner_image}
              brandPhoto={brandProfile?.photo}
              rating={brandProfile?.rating ?? 4.9}
              primaryCtaLabel={menuSections.some(s => s.id === 'combo') ? 'К комбо' : 'К хитам'}
              onPrimaryCta={() =>
                scrollToSection(
                  menuSections.some(s => s.id === 'combo')
                    ? 'combo'
                    : menuSections[0]?.id || 'hits',
                )
              }
            />

            {lastOrderPreview && cartCount === 0 ? (
              <button
                type="button"
                className="dam-repeat-card"
                onClick={() => applyRepeatPayload(lastOrderPreview)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF3B30]/10 text-[#FF3B30]">
                  <RotateCcw className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-extrabold text-zinc-900">Заказать как в прошлый раз</span>
                  <span className="block text-xs text-zinc-500 truncate">{lastOrderPreview.label}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </button>
            ) : null}

            <DamAlemStickyPills
              pills={stickyPills}
              activeId={activeSectionId}
              onSelect={scrollToSection}
              searchOpen={searchOpen}
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              onToggleSearch={() => {
                setSearchOpen(v => {
                  if (v) setSearchQuery('');
                  return !v;
                });
              }}
              searchPlaceholder={t('food.searchPlaceholder')}
              cartCount={cartCount}
              onOpenCart={() =>
                cartCount > 0 ? setCartOpen(true) : toast.info('Добавьте блюда в корзину')
              }
            />

            {searchQuery.trim() ? (
              <section className="dam-menu-section dam-animate-in" id="food-menu-search">
                <div className="dam-menu-section__head">
                  <h2 className="dam-section-title">Найдено: {poolItems.length}</h2>
                  <span className="dam-menu-section__count">«{searchQuery.trim()}»</span>
                </div>
                {poolItems.length > 0 ? (
                  <div className="dam-product-grid">
                    {poolItems.map(item => (
                      <MenuDishRow key={`search-${item.id}`} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="dam-card p-10 text-center">
                    <Utensils className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
                    <p className="font-bold text-zinc-900">{t('food.noDishes')}</p>
                    <p className="mt-2 text-sm text-zinc-500">{t('food.noDishesHint')}</p>
                  </div>
                )}
              </section>
            ) : (
              menuSections.map(section => {
                const isHits = section.id === 'hits';
                const isUfo = section.id === 'ufo';
                const isCompact =
                  section.id === 'sauces' ||
                  section.id === 'drinks' ||
                  section.id === 'snacks';
                return (
                  <section
                    key={section.id}
                    id={sectionDomId(section.id)}
                    className={`dam-menu-section dam-animate-in${section.id === 'combo' ? ' dam-combo-section' : ''}`}
                  >
                    <div className="dam-menu-section__head">
                      <h2 className="dam-section-title">{section.label}</h2>
                      <span className="dam-menu-section__count">{section.items.length}</span>
                    </div>
                    {isHits ? (
                      <div className="dam-hits-rail">
                        {section.items.map(item => (
                          <MenuDishRow key={`${section.id}-${item.id}`} item={item} />
                        ))}
                      </div>
                    ) : isUfo ? (
                      <div className="dam-product-grid dam-product-grid--hero">
                        {section.items.map(item => (
                          <MenuDishRow key={`${section.id}-${item.id}`} item={item} variant="hero" />
                        ))}
                      </div>
                    ) : isCompact ? (
                      <div className="space-y-2.5">
                        {section.items.map(item => (
                          <MenuDishRow
                            key={`${section.id}-${item.id}`}
                            item={item}
                            variant="row"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="dam-product-grid">
                        {section.items.map(item => (
                          <MenuDishRow key={`${section.id}-${item.id}`} item={item} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })
            )}

            {!searchQuery.trim() && menuSections.length === 0 ? (
              <div className="dam-card p-10 text-center">
                <Utensils className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
                <p className="font-bold text-zinc-900">{t('food.noDishes')}</p>
                <p className="mt-2 text-sm text-zinc-500">{t('food.noDishesHint')}</p>
              </div>
            ) : null}

            <details className="dam-card group">
              <summary className="cursor-pointer list-none p-4 text-sm font-bold text-zinc-700 marker:content-none flex items-center justify-between">
                Доставка · зоны · условия
                <ChevronRight className="h-4 w-4 text-zinc-400 transition group-open:rotate-90" />
              </summary>
              <div className="space-y-4 border-t border-zinc-100 px-4 pb-4 pt-2">
                {brandDescription ? (
                  <p className="text-sm leading-relaxed text-zinc-600">{brandDescription}</p>
                ) : null}
                <DamAlemOrderGuide
                  deliveryZones={guideZones}
                  minOrder={minOrder}
                  freeDeliveryFrom={freeDeliveryFrom}
                  formatPrice={formatPrice}
                />
                <DeliveryZonesPreview
                  zones={mapDeliveryZones}
                  storeLat={storeLatNum}
                  storeLng={storeLngNum}
                  formatPrice={formatPrice}
                />
              </div>
            </details>
          </div>

          {cartCount > 0 && !checkoutOpen ? (
            <DamAlemCartSidebar
              lines={cartSidebarLines}
              itemCount={cart.reduce((sum, ci) => sum + ci.quantity, 0)}
              subtotal={cartTotal}
              serviceFeeLabel={serviceFeeLabel}
              serviceFeeAmount={serviceFeeAmount}
              totalWithService={cartTotalWithService}
              minOrder={minOrder}
              freeDeliveryFrom={freeDeliveryFrom}
              nextGift={nextGift}
              formatPrice={formatPrice}
              checkoutLabel={t('food.checkout')}
              onOpenCart={() => setCartOpen(true)}
              onCheckout={openCheckout}
              onUpdateQty={updateQuantity}
              onRemoveLine={removeCartLine}
            />
          ) : null}
        </div>

        {/* ═══ PRODUCT POPUP MODAL ═══ */}
        {selectedItem && (
          <DamAlemSheet
            open
            overlayClassName="sm:p-4 sm:items-center"
            panelClassName="max-w-md !h-auto !max-h-[92vh] overflow-y-auto bg-[#FAFAFA] !rounded-t-[22px] sm:!rounded-[22px]"
            onClose={() => setSelectedItem(null)}
          >
              <div className="bg-white px-3 pb-1 pt-3 sm:rounded-t-[22px]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#ECECEC]">
                  <DamAlemImage src={getItemImage(selectedItem)} alt={selectedItem.name} className="h-full w-full object-cover" />
                  {selectedItemBadge && (
                    <span className="absolute left-3 top-3">
                      <FoodBadge type={selectedItemBadge} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#111111] shadow-sm ring-1 ring-black/5 transition hover:bg-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="bg-white px-5 pb-6 pt-1">
                <h3 className="text-[22px] font-extrabold leading-tight tracking-tight text-[#111111]">{localized(selectedItem, 'name') || selectedItem.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#777777]">{localized(selectedItem, 'description') || selectedItem.description}</p>

                {getGroupsForItem(selectedItem.id).map((group, gIdx) => {
                  const groupOptions = getOptionsForGroup(group.id);
                  const selectedOpts = currentSelections[group.id] || [];
                  if (groupOptions.length === 0) return null;

                  return (
                    <div key={group.id} className={gIdx === 0 ? 'mt-6' : 'mt-6 border-t border-gray-100 pt-5'}>
                      <div className="mb-3 flex items-center gap-2">
                        <h4 className="text-base font-bold text-[#111111]">{group.name}</h4>
                        {group.is_required && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-[#FF3B30]">{t('food.required')}</span>
                        )}
                      </div>
                      {group.type === 'checkbox' && (group.min_select > 0 || group.max_select < 10) && (
                        <p className="mb-2 -mt-1 text-[11px] text-[#777777]">
                          {group.min_select > 0 && `Мин: ${group.min_select}`}
                          {group.min_select > 0 && group.max_select < 10 && ' • '}
                          {group.max_select < 10 && `Макс: ${group.max_select}`}
                          {' • '}Выбрано: {selectedOpts.length}
                        </p>
                      )}
                      {group.type === 'radio' ? (
                        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 scrollbar-hide px-1">
                          {groupOptions.map(opt => {
                            const isSelected = selectedOpts.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleRadioSelect(group.id, opt.id)}
                                className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                                  isSelected
                                    ? 'border-[#FF3B30] text-[#FF3B30] bg-red-50/60'
                                    : 'border-gray-200 bg-white text-[#111111] hover:border-gray-300'
                                }`}
                              >
                                <span>{opt.name}</span>
                                {opt.price > 0 && (
                                  <span className={`ml-1 text-xs font-bold ${isSelected ? 'text-[#FF3B30]' : 'text-[#777777]'}`}>
                                    +{formatPrice(opt.price)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {groupOptions.map(opt => {
                            const isSelected = selectedOpts.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleCheckboxToggle(group.id, opt.id, group.max_select)}
                                className={`flex w-full items-center justify-between rounded-xl border p-3 transition ${
                                  isSelected ? 'border-[#FF3B30] bg-red-50' : 'border-gray-100 bg-[#F7F7F7] hover:border-gray-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition ${isSelected ? 'border-[#FF3B30] bg-[#FF3B30]' : 'border-gray-300'}`}>
                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                  <span className="text-sm font-medium text-[#111111]">{opt.name}</span>
                                </div>
                                <span className="text-sm font-bold text-[#FF3B30]">
                                  {opt.price > 0 ? `+${formatPrice(opt.price)}` : 'бесплатно'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Validation errors */}
                {!modalValidation.valid && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-red-600">
                      {modalValidation.errors.map((err, i) => <p key={i}>{err}</p>)}
                    </div>
                  </div>
                )}

                <div className="sticky bottom-0 bg-white pt-3 pb-1">
                  <Button
                    onClick={confirmAddWithSelections}
                    disabled={!modalValidation.valid}
                    className="w-full bg-[#FF3B30] hover:bg-[#E6352B] text-white h-14 text-base font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {formatPrice(modalTotalPrice)}  + {t('food.addToCart')}
                  </Button>
                </div>
              </div>
          </DamAlemSheet>
        )}

        {/* ═══ FLOATING CART BUTTON ═══ */}
        {cartCount > 0 && !cartOpen && !checkoutOpen && !selectedItem && (
          <DamAlemFloatingCart
            itemLabel={cartBarLabel}
            totalLabel={formatPrice(cartTotalWithService)}
            cartLabel={t('food.cart')}
            onOpen={() => setCartOpen(true)}
            progressPercent={floatingGoal.percent}
            progressLabel={floatingGoal.label}
          />
        )}

        {/* ═══ CART DRAWER ═══ */}
        <DamAlemSheet open={cartOpen} onClose={() => setCartOpen(false)} testId="dam-cart-sheet" panelClassName="dam-sheet-panel--cart">
              <div className="dam-sheet-header dam-sheet-header--cart">
                <div>
                  <h2>{t('food.yourOrder')}</h2>
                  <p className="dam-sheet-header__meta">
                    {cart.reduce((sum, ci) => sum + ci.quantity, 0)} {cart.length === 1 ? 'позиция' : cart.length < 5 ? 'позиции' : 'позиций'}
                  </p>
                  <div className="dam-step-bar" aria-hidden>
                    <span className={`dam-step-bar__dot ${uiStep >= 1 ? 'dam-step-bar__dot--done' : ''}`} />
                    <span className={`dam-step-bar__dot ${uiStep === 2 ? 'dam-step-bar__dot--active' : uiStep > 2 ? 'dam-step-bar__dot--done' : ''}`} />
                    <span className={`dam-step-bar__dot ${uiStep === 3 ? 'dam-step-bar__dot--active' : ''}`} />
                  </div>
                </div>
                <button type="button" onClick={() => setCartOpen(false)} className="absolute right-5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="dam-sheet-body space-y-3">
                {cart.map((ci, idx) => {
                  const modTotal = calcSelectionsPrice(ci.selections);
                  const selNames = getSelectionNames(ci.selections);
                  const linePrice = (ci.item.price + modTotal) * ci.quantity;
                  return (
                    <div key={idx} className="dam-cart-line">
                      <div className="dam-cart-line__media">
                        <DamAlemImage src={getItemImage(ci.item)} alt={ci.item.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2 pr-1">
                          <h4 className="text-sm font-extrabold leading-snug text-[#18181b] line-clamp-2">{ci.item.name}</h4>
                          <button
                            type="button"
                            onClick={() => removeCartLine(idx)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
                            aria-label={t('common.close')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {selNames.length > 0 && (
                          <p className="mt-1 text-[11px] font-semibold text-[#FF3B30] line-clamp-2">+ {selNames.join(', ')}</p>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-base font-extrabold text-[#18181b] tabular-nums">{formatPrice(linePrice)}</span>
                          <div className="dam-cart-line__qty">
                            <button type="button" onClick={() => updateQuantity(idx, -1)} data-testid="dam-cart-qty-minus">
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums px-0.5" data-testid="dam-cart-qty-value">{ci.quantity}</span>
                            <button type="button" onClick={() => updateQuantity(idx, 1)} data-testid="dam-cart-qty-plus">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {showRecommendations && cartSuggestions.length > 0 && (
                  <div className="dam-upsell-rail">
                    <h4 className="dam-upsell-rail__title">{t('food.addToOrder')}</h4>
                    <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-0.5 px-0.5">
                      {cartSuggestions.map(item => (
                        <div key={item.id} className="dam-upsell-card">
                          <div className="aspect-square overflow-hidden bg-[#F0F0F0]">
                            <DamAlemImage src={getItemImage(item)} alt={item.name} className="h-full w-full object-cover" />
                          </div>
                          <div className="p-2">
                            <p className="text-[11px] font-bold leading-tight text-[#18181b] line-clamp-2">{item.name}</p>
                            <div className="mt-2 flex items-center justify-between gap-1">
                              <span className="text-[11px] font-extrabold text-[#18181b]">{formatPrice(item.price)}</span>
                              <button
                                type="button"
                                onClick={() => void quickAdd(item)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF3B30] to-[#FF8C42] text-white shadow-sm active:scale-90 transition-transform"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="dam-sheet-footer dam-sheet-footer--premium space-y-3">
                <OrderGoalsProgress
                  subtotal={cartTotal}
                  minOrder={minOrder}
                  freeDeliveryFrom={freeDeliveryFrom}
                  nextGift={nextGift}
                  compact
                />
                <div className="dam-order-totals">
                  <div className="dam-order-totals__row">
                    <span>{t('food.subtotal')}</span>
                    <span>{formatPrice(cartTotal)}</span>
                  </div>
                  <div className="dam-order-totals__row">
                    <span>{serviceFeeLabel}</span>
                    <span>{formatPrice(serviceFeeAmount)}</span>
                  </div>
                  <div className="dam-order-totals__total">
                    <span>{t('food.total')}</span>
                    <span>{formatPrice(cartTotalWithService)}</span>
                  </div>
                </div>
                <DamAlemCheckoutButton
                  label={t('food.checkout')}
                  sublabel={
                    minOrder > 0 && cartTotal < minOrder
                      ? `Минимальная сумма заказа — ${minOrder.toLocaleString('ru-RU')} ₸`
                      : formatPrice(cartTotalWithService)
                  }
                  onClick={openCheckout}
                  testId="dam-cart-checkout"
                />
              </div>
        </DamAlemSheet>

        {/* ═══ CHECKOUT MODAL ═══ */}
        <DamAlemSheet open={checkoutOpen} onClose={() => setCheckoutOpen(false)} panelClassName="dam-sheet-panel--wide">
              <div className="dam-sheet-header dam-sheet-header--cart !justify-between !px-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutStep > 1) {
                        setCheckoutStep(s => (s === 3 ? 2 : 1));
                        return;
                      }
                      setCheckoutOpen(false);
                      setCartOpen(true);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate">
                      {checkoutStep === 1
                        ? 'Получение'
                        : checkoutStep === 2
                          ? 'Контакты и оплата'
                          : 'Подтверждение'}
                    </h2>
                    <div className="dam-step-bar !justify-start !mt-1" aria-hidden>
                      <span className={`dam-step-bar__dot ${checkoutStep >= 1 ? 'dam-step-bar__dot--done' : ''} ${checkoutStep === 1 ? 'dam-step-bar__dot--active' : ''}`} />
                      <span className={`dam-step-bar__dot ${checkoutStep > 2 ? 'dam-step-bar__dot--done' : ''} ${checkoutStep === 2 ? 'dam-step-bar__dot--active' : ''}`} />
                      <span className={`dam-step-bar__dot ${checkoutStep === 3 ? 'dam-step-bar__dot--active' : ''}`} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="dam-checkout-total-chip">{formatPrice(checkoutGrandTotal)}</span>
                  <button type="button" onClick={() => setCheckoutOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="dam-sheet-body">
                <div className="dam-checkout-layout">
                  <div className="dam-checkout-main space-y-4">
                {checkoutStep === 1 ? (
                <>
                <div className="dam-checkout-section">
                  <div className="dam-checkout-section__title">Способ получения</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`dam-method-card ${deliveryMethod === 'delivery' ? 'dam-method-card--active' : ''}`}
                    >
                      <Truck className={`w-6 h-6 mx-auto mb-1.5 ${deliveryMethod === 'delivery' ? 'text-[#FF3B30]' : 'text-gray-400'}`} />
                      <span className={`text-sm font-bold block ${deliveryMethod === 'delivery' ? 'text-[#FF3B30]' : 'text-gray-600'}`}>{t('food.delivery')}</span>
                      <span className="text-xs text-gray-400 mt-0.5 block">
                        {cartTotal >= freeDeliveryFrom && freeDeliveryFrom > 0
                          ? t('food.free')
                          : mapDeliveryZones.length > 0
                            ? `от ${formatPrice(deliveryFromPrice)}`
                            : formatPrice(parseInt(settings.delivery_price) || 0)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`dam-method-card ${deliveryMethod === 'pickup' ? 'dam-method-card--active' : ''}`}
                    >
                      <Store className={`w-6 h-6 mx-auto mb-1.5 ${deliveryMethod === 'pickup' ? 'text-[#FF3B30]' : 'text-gray-400'}`} />
                      <span className={`text-sm font-bold block ${deliveryMethod === 'pickup' ? 'text-[#FF3B30]' : 'text-gray-600'}`}>{t('food.pickup')}</span>
                      <span className="text-xs text-gray-400 mt-0.5 block">{t('food.free')}</span>
                    </button>
                  </div>
                </div>

                {deliveryMethod === 'delivery' && (freeDeliveryFrom > 0 || minOrder > 0 || nextGift) && (
                  <OrderGoalsProgress
                    subtotal={cartTotal}
                    minOrder={minOrder}
                    freeDeliveryFrom={freeDeliveryFrom}
                    nextGift={nextGift}
                  />
                )}

                {deliveryMethod === 'delivery' && (
                  <div className="space-y-3">
                    <div className="dam-checkout-section">
                      <div className="dam-checkout-section__title">
                        <MapPin className="h-4 w-4 text-[#FF3B30]" />
                        Адрес доставки
                      </div>
                      <SavedAddressBar
                        currentAddress={deliveryAddress}
                        onSelect={applySavedAddress}
                        accent="orange"
                      />
                      <div ref={addressPickerRef} className="scroll-mt-24">
                        <DeliveryAddressPicker
                          accent="orange"
                          address={deliveryAddress}
                          onAddressChange={(v) => {
                            setDeliveryAddress(v);
                            if (addressFormCollapsed) setAddressFormCollapsed(false);
                          }}
                          hasDeliveryZones={hasDeliveryZones}
                          deliveryQuote={deliveryQuote}
                          loading={deliveryQuoteLoading}
                          error={deliveryQuoteError}
                          onFindByAddress={() => findByAddress()}
                          onFindByGps={requestGeolocation}
                          onSelectExample={(ex) => findByAddress(ex)}
                          collapsed={addressFormCollapsed && deliveryReady}
                          onEdit={focusAddressPicker}
                        />
                      </div>
                      {deliveryReady && deliveryQuote?.zone_name && (
                        <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-[#FF3B30] ring-1 ring-red-100">
                          Зона: {deliveryQuote.zone_name} · {activeDeliveryPrice === 0 ? 'бесплатно' : formatPrice(activeDeliveryPrice)}
                        </div>
                      )}
                      {!deliveryReady && !deliveryQuoteLoading && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                          {deliveryQuoteError
                            ? deliveryQuoteError
                            : deliveryUnavailableMessage
                              ? deliveryUnavailableMessage
                              : (deliveryQuote?.display_address || effectiveAddress).trim().length < 5
                                ? 'Укажите адрес доставки'
                                : 'Нажмите «Я здесь сейчас» или введите адрес и «Найти на карте»'}
                        </p>
                      )}
                    </div>

                    <div className="dam-checkout-section">
                      <div className="dam-checkout-section__title">Куда занести заказ?</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setDeliverToApartment(false)}
                          className={`rounded-2xl border-2 p-3 text-left transition-all ${
                            !deliverToApartment
                              ? 'border-[#FF3B30] bg-red-50 shadow-sm'
                              : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                          }`}
                        >
                          <span className={`text-sm font-bold block ${!deliverToApartment ? 'text-[#FF3B30]' : 'text-gray-800'}`}>
                            До подъезда
                          </span>
                          <span className="text-xs text-gray-500 mt-0.5 block">Курьер отдаст у входа · бесплатно</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliverToApartment(true)}
                          className={`rounded-2xl border-2 p-3 text-left transition-all ${
                            deliverToApartment
                              ? 'border-[#FF3B30] bg-red-50 shadow-sm'
                              : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                          }`}
                        >
                          <span className={`text-sm font-bold block ${deliverToApartment ? 'text-[#FF3B30]' : 'text-gray-800'}`}>
                            До квартиры
                            <span className="ml-1">+{formatPrice(APARTMENT_DELIVERY_FEE)}</span>
                          </span>
                          <span className="text-xs text-gray-500 mt-0.5 block">Поднимем до двери · нужен № квартиры</span>
                        </button>
                      </div>
                      {deliverToApartment && (
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">
                            Номер квартиры, этаж, домофон *
                          </label>
                          <Input
                            value={apartment}
                            onChange={e => setApartment(e.target.value)}
                            placeholder="Например: кв. 42, 3 этаж"
                            className={`rounded-xl h-11 border-gray-200 focus:border-[#FF3B30] ${!apartmentValid ? 'border-amber-400 ring-1 ring-amber-200' : ''}`}
                            autoFocus
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>
                ) : null}

                {checkoutStep === 2 ? (
                <>
                {/* Contact info */}
                <div className="dam-checkout-section">
                  <div className="dam-checkout-section__title">Контактные данные</div>
                  <div className="dam-field-grid dam-field-grid--2">
                  <div className="dam-field">
                    <label className="mb-1.5 block">
                      {t('food.yourName')} *
                    </label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Введите имя" className="dam-input" />
                  </div>
                  <div className="dam-field">
                    <label className="mb-1.5 block">{t('food.phone')} *</label>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="+7 (___) ___-__-__"
                      className="dam-input"
                    />
                  </div>
                  </div>

                  <div className="dam-field mt-3">
                    <label className="mb-1.5 block">{t('food.comment')}</label>
                    <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Пожелания к заказу..." className="dam-input dam-textarea" rows={2} />
                  </div>
                </div>

                {loyaltyGifts.length > 0 && (
                  <LoyaltyGiftBanner subtotal={cartTotal} gifts={loyaltyGifts} compact />
                )}

                <div className="dam-checkout-section space-y-2">
                  <div className="dam-checkout-section__title !mb-2">Промокод</div>
                  <div className="flex gap-2">
                    <Input
                      value={promoInput}
                      onChange={e => setPromoInput(e.target.value.toUpperCase())}
                      placeholder="Введите код"
                      className="rounded-xl h-11 uppercase font-mono"
                      disabled={!!appliedPromo}
                    />
                    {appliedPromo ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0"
                        onClick={() => { setAppliedPromo(null); setPromoInput(''); }}
                      >
                        Сбросить
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="dam-promo-apply h-11 shrink-0"
                        disabled={promoLoading || !promoInput.trim()}
                        onClick={() => void applyPromoCode()}
                      >
                        {promoLoading ? '…' : 'Применить'}
                      </Button>
                    )}
                  </div>
                  {appliedPromo && (
                    <p className="text-xs text-emerald-700 font-medium">✓ {appliedPromo.label}</p>
                  )}
                </div>

                <div className="dam-checkout-section">
                  <div className="dam-checkout-section__title">Способ оплаты</div>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed -mt-2">{t('food.guide.paymentNote')}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { id: 'cash' as const, label: 'Наличные', Icon: Banknote },
                        { id: 'kaspi_qr' as const, label: 'Kaspi QR', Icon: Smartphone },
                        { id: 'halyk_qr' as const, label: 'Halyk QR', Icon: Smartphone },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPayment(id)}
                        className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition ${
                          payment === id
                            ? 'border-[#FF3B30] bg-red-50 text-[#FF3B30]'
                            : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                </>
                ) : null}

                {checkoutStep === 3 ? (
                  <div className="dam-checkout-section space-y-3 lg:hidden">
                    <div className="dam-checkout-section__title">Проверьте заказ</div>
                    <p className="text-sm text-zinc-600">
                      {deliveryMethod === 'delivery' ? 'Доставка' : 'Самовывоз'}
                      {deliveryMethod === 'delivery' && effectiveAddress
                        ? ` · ${effectiveAddress}`
                        : ''}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {customerName} · {customerPhone} · {PAYMENT_LABELS[payment]}
                    </p>
                    <p className="text-sm font-semibold text-zinc-800">
                      Примерное время: {deliveryTimeLabel}
                    </p>
                  </div>
                ) : null}
                  </div>

                  <aside className={`dam-checkout-aside space-y-4${checkoutStep === 3 ? '' : ' hidden lg:block'}`}>
                {/* Order summary */}
                <div className="dam-checkout-section dam-checkout-section--summary">
                  <div className="dam-checkout-section__title">{t('food.yourOrder')}</div>
                  <div className="space-y-2.5">
                    {cart.map((ci, idx) => {
                      const modTotal = calcSelectionsPrice(ci.selections);
                      const selNames = getSelectionNames(ci.selections);
                      return (
                        <div key={idx} className="flex gap-2.5 items-start">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                            <DamAlemImage src={getItemImage(ci.item)} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="flex flex-1 min-w-0 items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-800 font-semibold leading-snug">{ci.item.name} × {ci.quantity}</span>
                            {selNames.length > 0 && (
                              <span className="text-[11px] text-[#FF3B30] block mt-0.5">+ {selNames.join(', ')}</span>
                            )}
                          </div>
                          <span className="font-bold text-sm text-gray-900 whitespace-nowrap">{formatPrice((ci.item.price + modTotal) * ci.quantity)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('food.subtotal')}</span>
                      <span className="font-semibold text-gray-900">{formatPrice(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{serviceFeeLabel}</span>
                      <span className="font-semibold text-gray-900">{formatPrice(serviceFeeAmount)}</span>
                    </div>
                    {deliveryMethod === 'delivery' && deliverToApartment && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">До квартиры</span>
                        <span className="font-semibold text-[#FF3B30]">+{formatPrice(apartmentDeliveryFee)}</span>
                      </div>
                    )}
                    {deliveryMethod === 'delivery' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5" /> {t('food.delivery')}
                          {deliveryQuote?.zone_name && (
                            <span className="text-[10px] text-gray-400">({deliveryQuote.zone_name})</span>
                          )}
                        </span>
                        <span className={`font-semibold ${activeDeliveryPrice === 0 ? 'text-emerald-600' : 'text-[#FF3B30]'}`}>
                          {activeDeliveryPrice === 0 ? t('food.free') : `+${formatPrice(activeDeliveryPrice)}`}
                        </span>
                      </div>
                    )}
                    {appliedPromo && promoDiscountAmount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-700">
                        <span>Промокод {appliedPromo.code}</span>
                        <span className="font-semibold">−{formatPrice(promoDiscountAmount)}</span>
                      </div>
                    )}
                    {getAccountToken() && bonusBalance > 0 && !appliedPromo && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-2">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useBonuses && maxBonusPoints > 0}
                            disabled={maxBonusPoints <= 0}
                            onChange={(e) => setUseBonuses(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-amber-300 text-[#FF3B30]"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                              <Coins className="h-4 w-4" />
                              Списать бонусы
                            </span>
                            <span className="block text-xs text-amber-800/80 mt-0.5">
                              Баланс: {formatPrice(bonusBalance)} · до {BONUS_MAX_PERCENT}% от блюд
                              {useBonuses && bonusDiscountAmount > 0 ? ` · −${formatPrice(bonusDiscountAmount)}` : ''}
                            </span>
                          </span>
                        </label>
                      </div>
                    )}
                    {bonusDiscountAmount > 0 && (
                      <div className="flex justify-between text-sm text-amber-700">
                        <span>Бонусы Sortirovka24</span>
                        <span className="font-semibold">−{formatPrice(bonusDiscountAmount)}</span>
                      </div>
                    )}
                    {loyaltyGift && (
                      <div className="flex justify-between text-sm text-emerald-700">
                        <span>🎁 Подарок</span>
                        <span className="font-medium truncate ml-2">{loyaltyGift.title}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-2 text-base">
                      <span className="font-extrabold text-gray-900">{t('food.total')}</span>
                      <span className="font-extrabold text-[#FF3B30]">{formatPrice(checkoutGrandTotal)}</span>
                    </div>
                  </div>
                </div>
                  </aside>
                </div>
              </div>

              <div className="dam-sheet-footer dam-sheet-footer--premium">
                {checkoutStep === 3 && checkoutBlockReason && !submitting ? (
                  <p
                    role="alert"
                    data-testid="dam-checkout-block-reason"
                    className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900"
                  >
                    {checkoutBlockReason}
                  </p>
                ) : null}
                {checkoutStep < 3 ? (
                  <DamAlemCheckoutButton
                    label={checkoutStep === 1 ? 'Далее: контакты' : 'Далее: подтверждение'}
                    sublabel={formatPrice(checkoutGrandTotal)}
                    onClick={() => {
                      if (checkoutStep === 1) {
                        if (deliveryMethod === 'delivery' && !deliveryReady) {
                          toast.error(
                            deliveryQuoteError ||
                              deliveryUnavailableMessage ||
                              'Укажите адрес доставки',
                          );
                          return;
                        }
                        if (deliveryMethod === 'delivery' && deliverToApartment && !apartment.trim()) {
                          toast.error('Укажите номер квартиры');
                          return;
                        }
                        setCheckoutStep(2);
                        return;
                      }
                      if (!customerName.trim() || !customerPhone.trim()) {
                        toast.error('Укажите имя и телефон');
                        return;
                      }
                      setCheckoutStep(3);
                    }}
                    testId="dam-checkout-next"
                  />
                ) : (
                  <>
                    <DamAlemCheckoutButton
                      label={submitting ? 'Отправляем заказ…' : 'Оформить заказ'}
                      sublabel={
                        checkoutBlockReason && !submitting
                          ? checkoutBlockReason
                          : formatPrice(checkoutGrandTotal)
                      }
                      disabled={submitting}
                      loading={submitting}
                      onClick={submitOrder}
                      testId="dam-checkout-submit"
                    />
                    <p className="mt-2.5 text-center text-[11px] text-gray-400">
                      Заказ сохранится в системе. WhatsApp — по желанию после оформления.
                    </p>
                  </>
                )}
              </div>
        </DamAlemSheet>
      </div>
    </Layout>
  );
}