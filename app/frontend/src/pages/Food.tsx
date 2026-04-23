import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { resolveImageSrc } from '@/lib/storage';
import {
  Plus, Minus, X, Utensils, Truck, Store,
  ChevronRight, MapPin, MessageSquare,
  ArrowLeft, Check,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { getCurrentUser, pushCabinetItem, requireAuthDialog } from '@/lib/localAuth';

/* ─── CDN images ─── */
const FALLBACK_FOOD_1 = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png';
const FALLBACK_FOOD_2 = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png';
const FALLBACK_IMAGES = [FALLBACK_FOOD_1, FALLBACK_FOOD_2];

/* ─── Types ─── */
interface FoodCategory {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  slug?: string;
  image?: string;
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
}
interface ModifierGroup { id: number; name: string; type: string; is_required: boolean; min_select: number; max_select: number; sort_order: number; is_active: boolean; }
interface ModifierOption { id: number; group_id: number; name: string; price: number; sort_order: number; is_active: boolean; }
interface ItemModGroupLink { id: number; food_item_id: number; modifier_group_id: number; sort_order: number; }
interface DeliveryZone { name: string; radius_km: number; price: number; }
interface Settings {
  whatsapp_number: string; hero_banner_title: string; hero_banner_subtitle: string;
  hero_banner_image: string; min_order_amount: string; delivery_price: string;
  delivery_zones: string; show_recommendations: string;
}

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

/** Две «информативные» подписи как в Tasko (красные в строке мета) */
function itemMetaTags(item: FoodItem): string[] {
  const d = `${item.name} ${item.description || ''}`.toLowerCase();
  const tags: string[] = [];
  if (d.includes('белок') || d.includes('протеин') || d.includes('курин') || d.includes('индейк') || d.includes('рыб')) tags.push('Много белка');
  if (d.includes('печ') || d.includes('духов') || d.includes('пицц') || d.includes('выпечк')) tags.push('Из печи');
  if (tags.length === 0) tags.push('Много белка', 'Из печи');
  return tags.slice(0, 2);
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
  if (raw) return raw;
  return slugifyFoodCategory(cat.name || `cat-${cat.id}`);
}

function itemCategorySlug(item: FoodItem, cats: FoodCategory[]): string {
  if (item.category_slug) return item.category_slug;
  const c = cats.find(x => x.id === item.category_id);
  return c ? categorySlugOf(c) : '';
}

const PROMO_SLIDES = [
  { titleKey: 'food.promoSlide1Title' as const, linesKeys: ['food.promoLine1a', 'food.promoLine1b', 'food.promoLine1c'] as const },
  { titleKey: 'food.promoSlide2Title' as const, linesKeys: ['food.promoLine2a', 'food.promoLine2b', 'food.promoLine2c'] as const },
  { titleKey: 'food.promoSlide3Title' as const, linesKeys: ['food.promoLine3a', 'food.promoLine3b', 'food.promoLine3c'] as const },
];

/** Оверлей «N В корзине» как в референсе Tasko */
function InCartOverlay({ qty, className = '' }: { qty: number; className?: string }) {
  if (qty <= 0) return null;
  return (
    <div className={`absolute inset-0 bg-black/45 flex items-center justify-center z-10 ${className}`}>
      <span className="text-white text-sm font-semibold tracking-tight">
        {qty} В корзине
      </span>
    </div>
  );
}

export default function Food() {
  const navigate = useNavigate();
  const { t, localized, lang } = useLanguage();
  const [promoSlide, setPromoSlide] = useState(0);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [modGroups, setModGroups] = useState<ModifierGroup[]>([]);
  const [modOptions, setModOptions] = useState<ModifierOption[]>([]);
  const [itemGroupLinks, setItemGroupLinks] = useState<ItemModGroupLink[]>([]);
  const [settings, setSettings] = useState<Settings>({
    whatsapp_number: '+77001234567',
    hero_banner_title: 'Вкусная еда с доставкой',
    hero_banner_subtitle: 'Свежие блюда домашней кухни',
    hero_banner_image: '',
    min_order_amount: '2000',
    delivery_price: '500',
    delivery_zones: '[]',
    show_recommendations: 'true',
  });
  /** 'all' — весь каталог; иначе slug категории (как в /api/products?category=) */
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [currentSelections, setCurrentSelections] = useState<CartItemSelection>({});

  // Checkout form - split address
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [apartment, setApartment] = useState('');
  const [noDoorDelivery, setNoDoorDelivery] = useState(false);
  const [comment, setComment] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPromoSlide(s => (s + 1) % PROMO_SLIDES.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, []);

  async function loadData() {
    setLoading(true);
    const CACHE_TTL = 5 * 60 * 1000;
    const cq = (key: string, fn: () => Promise<any>) => fetchWithCache(`food_${key}`, () => withRetry(fn), CACHE_TTL);
    const catalogHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'App-Host': typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
    };
    try {
      let cats: FoodCategory[] | null = null;
      let foodItems: FoodItem[] | null = null;
      try {
        const [cRes, pRes] = await Promise.all([
          fetch('/api/categories', { headers: catalogHeaders }),
          fetch('/api/products', { headers: catalogHeaders }),
        ]);
        if (cRes.ok && pRes.ok) {
          const cj = await cRes.json();
          const pj = await pRes.json();
          const rawCats = Array.isArray(cj.categories) ? cj.categories : [];
          const mappedCats: FoodCategory[] = rawCats.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            image: c.image,
            icon: (c.image && String(c.image).trim()) ? '' : '🍽',
            sort_order: typeof c.order === 'number' ? c.order : 0,
            is_active: true,
          }));
          const slugById: Record<number, string> = {};
          for (const c of mappedCats) slugById[c.id] = categorySlugOf(c);
          const rawProds = Array.isArray(pj.products) ? pj.products : [];
          foodItems = rawProds.map((p: any) => ({
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
            weight: '',
            sort_order: 0,
            category_slug: (p.category_slug as string) || slugById[p.category_id] || '',
          }));
          cats = mappedCats;
        }
      } catch (e) {
        console.warn('[Food] catalog API:', e);
      }

      const results = await Promise.allSettled([
        cats
          ? Promise.resolve({ data: { items: [] as FoodCategory[] } })
          : cq('categories', () => client.entities.food_categories.query({ sort: 'sort_order', limit: 50 })),
        foodItems
          ? Promise.resolve({ data: { items: [] as FoodItem[] } })
          : cq('items', () => client.entities.food_items.query({ sort: 'sort_order', limit: 200 })),
        cq('mod_groups', () => client.entities.modifier_groups.query({ sort: 'sort_order', limit: 100 })),
        cq('mod_options', () => client.entities.modifier_options.query({ sort: 'sort_order', limit: 500 })),
        cq('item_groups', () => client.entities.item_modifier_groups.query({ limit: 500 })),
        cq('settings', () => client.entities.food_settings.query({ limit: 50 })),
      ]);
      const extract = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? (r.value?.data?.items || []) : []);

      if (cats && foodItems) {
        setCategories(cats);
        setItems(foodItems);
      } else {
        const ecats: FoodCategory[] = extract(results[0]).filter((c: FoodCategory) => c.is_active);
        const eitems: FoodItem[] = extract(results[1]).filter((i: FoodItem) => i.is_active).map((i: FoodItem) => ({
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
      setSelectedCategorySlug('all');

      setModGroups(extract(results[2]).filter((g: ModifierGroup) => g.is_active));
      setModOptions(extract(results[3]).filter((o: ModifierOption) => o.is_active));
      setItemGroupLinks(extract(results[4]));
      const settingsArr = extract(results[5]);
      const s: Record<string, string> = {};
      settingsArr.forEach((item: any) => {
        if (item.setting_key && item.setting_value) s[item.setting_key] = item.setting_value;
      });
      setSettings(prev => ({ ...prev, ...s }));
    } catch (e) {
      console.error('Error loading food data:', e);
    } finally {
      setLoading(false);
    }
  }

  // Parse delivery zones from settings
  const deliveryZones: DeliveryZone[] = useMemo(() => {
    try {
      const parsed = JSON.parse(settings.delivery_zones || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [settings.delivery_zones]);

  const poolItems = items;

  const filteredItems = useMemo(() => {
    if (selectedCategorySlug === 'all') return poolItems;
    return poolItems.filter(i => itemCategorySlug(i, categories) === selectedCategorySlug);
  }, [poolItems, selectedCategorySlug, categories]);

  const sortedFilteredItems = useMemo(() => {
    return [...filteredItems].sort(
      (a, b) =>
        Number(b.is_popular || b.is_recommended) - Number(a.is_popular || a.is_recommended)
    );
  }, [filteredItems]);
  const recommendedItems = useMemo(
    () => poolItems.filter(i => i.is_popular || i.is_recommended).slice(0, 6),
    [poolItems]
  );
  const comboItems = useMemo(() => poolItems.filter(i => i.is_combo), [poolItems]);

  const sortedNavCategories = useMemo(
    () => [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [categories]
  );

  const activeCategoryLabel = useMemo(() => {
    if (selectedCategorySlug === 'all') return t('food.allDishes');
    const c = categories.find(x => categorySlugOf(x) === selectedCategorySlug);
    return (c && (localized(c, 'name') || c.name)) || t('food.allDishes');
  }, [selectedCategorySlug, categories, localized, t]);

  const showRecommendations = settings.show_recommendations !== 'false';

  function isGridCategoryActive(slug: string): boolean {
    return selectedCategorySlug === slug;
  }

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
  const SERVICE_FEE_RATE = 0.1;
  const serviceFeeAmount = useMemo(() => Math.round(cartTotal * SERVICE_FEE_RATE), [cartTotal]);
  const cartTotalWithService = cartTotal + serviceFeeAmount;

  const [selectedZoneIndex, setSelectedZoneIndex] = useState(0);
  const activeDeliveryPrice = useMemo(() => {
    if (deliveryMethod !== 'delivery') return 0;
    if (deliveryZones.length > 0) {
      return deliveryZones[selectedZoneIndex]?.price || deliveryZones[0]?.price || 0;
    }
    return parseInt(settings.delivery_price) || 0;
  }, [deliveryMethod, deliveryZones, selectedZoneIndex, settings.delivery_price]);

  /** Сумма к оплате: позиции + 10% сервис + доставка (если есть) */
  const checkoutGrandTotal = useMemo(() => {
    if (deliveryMethod === 'delivery') return cartTotalWithService + activeDeliveryPrice;
    return cartTotalWithService;
  }, [deliveryMethod, cartTotalWithService, activeDeliveryPrice]);

  /** Меню по категориям из API (когда фильтр «Всё меню») */
  const menuSections = useMemo(() => {
    const sortedCats = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return sortedCats
      .map(cat => ({
        cat,
        items: poolItems.filter(i => i.category_id === cat.id),
      }))
      .filter(s => s.items.length > 0);
  }, [categories, poolItems]);

  const showGroupedMenu = selectedCategorySlug === 'all';

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

  const minOrder = parseInt(settings.min_order_amount) || 0;

  function getItemQuantityInCart(itemId: number) {
    return cart.filter(ci => ci.item.id === itemId).reduce((s, ci) => s + ci.quantity, 0);
  }

  // Get suggestions for "Дополнить заказ" section
  const cartSuggestions = useMemo(() => {
    if (cart.length === 0) return [];
    const cartItemIds = new Set(cart.map(ci => ci.item.id));
    const cartCategoryIds = new Set(cart.map(ci => ci.item.category_id));

    // Find drink/sauce/dessert categories by common keywords
    const suggestCategories = categories.filter(c => {
      const name = c.name.toLowerCase();
      return name.includes('напит') || name.includes('соус') || name.includes('десерт') ||
             name.includes('drink') || name.includes('sauce') || name.includes('dessert');
    });
    const suggestCatIds = new Set(suggestCategories.map(c => c.id));

    // Priority: recommended items not in cart, then items from suggest categories, then items from same categories
    const candidates = items.filter(i => !cartItemIds.has(i.id) && i.is_active);
    const scored = candidates.map(i => {
      let score = 0;
      if (i.is_recommended) score += 3;
      if (suggestCatIds.has(i.category_id)) score += 2;
      if (cartCategoryIds.has(i.category_id)) score += 1;
      return { item: i, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map(s => s.item);
  }, [cart, items, categories]);

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

  function quickAdd(item: FoodItem) {
    if (itemHasGroups(item.id)) {
      openItemModal(item);
    } else {
      addToCart(item, {});
    }
  }

  function openItemModal(item: FoodItem) {
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
      const idx = prev.findIndex(ci => ci.item.id === itemId);
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
    if (!requireAuthDialog(navigate)) return;
    if (!customerPhone.trim()) { toast.error('Укажите телефон'); return; }
    if (cartTotal < minOrder) { toast.error(`${t('food.minOrder')}: ${minOrder} ₸`); return; }

    if (!customerName.trim()) { toast.error('Заполните имя'); return; }
    if (deliveryMethod === 'delivery' && (!street.trim() || !house.trim())) { toast.error('Укажите улицу и дом'); return; }

    const fullAddress = deliveryMethod === 'delivery'
      ? `${street}, д. ${house}${apartment ? `, кв. ${apartment}` : ''}${noDoorDelivery ? ' (до подъезда)' : ''}`
      : '';

    const orderItems = cart.map(ci => {
      const selNames = getSelectionNames(ci.selections);
      const modTotal = calcSelectionsPrice(ci.selections);
      return { name: ci.item.name, price: ci.item.price, quantity: ci.quantity, modifiers: selNames.map(n => ({ name: n, price: 0 })), modTotal };
    });
    const total = checkoutGrandTotal;
    try {
      const u = getCurrentUser();
      const uidNum = u?.id && /^\d+$/.test(u.id) ? parseInt(u.id, 10) : undefined;
      await withRetry(() =>
        client.entities.food_orders.create({
          data: {
            ...(uidNum != null ? { user_id: uidNum } : {}),
            order_items: JSON.stringify(orderItems),
            total_amount: total,
            customer_name: customerName,
            customer_phone: customerPhone,
            delivery_address: fullAddress,
            comment,
            delivery_method: deliveryMethod,
            status: 'new',
            created_at: new Date().toISOString(),
          },
        })
      );
      pushCabinetItem('foodOrders', {
        title: `Заказ на ${total.toLocaleString('ru-RU')} ₸`,
        subtitle: deliveryMethod === 'delivery' ? fullAddress : 'Самовывоз',
        status: 'Новый',
      });
      const whatsappNumber = settings.whatsapp_number.replace(/[^0-9]/g, '');
      let msg = `🍽 *Новый заказ*\n\n👤 ${customerName}\n📞 ${customerPhone}\n`;
      if (deliveryMethod === 'delivery') {
        msg += `📍 ${fullAddress}\n🚗 Доставка: ${activeDeliveryPrice} ₸\n`;
        if (noDoorDelivery) msg += `📦 До подъезда\n`;
      } else { msg += `🏪 Самовывоз\n`; }
      if (comment) msg += `💬 ${comment}\n`;
      msg += `\n*Заказ:*\n`;
      cart.forEach(ci => {
        const selNames = getSelectionNames(ci.selections);
        const modStr = selNames.length > 0 ? ` + ${selNames.join(', ')}` : '';
        const modTotal = calcSelectionsPrice(ci.selections);
        msg += `• ${ci.item.name}${modStr} × ${ci.quantity} = ${(ci.item.price + modTotal) * ci.quantity} ₸\n`;
      });
      msg += `\nТовары: ${cartTotal} ₸\nСервисный сбор (10%): ${serviceFeeAmount} ₸\n`;
      if (deliveryMethod === 'delivery') msg += `Доставка: ${activeDeliveryPrice} ₸\n`;
      msg += `\n*Итого: ${total} ₸*`;
      window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');
      toast.success('Заказ оформлен! Откроется WhatsApp для подтверждения.');
      setCart([]); setCheckoutOpen(false); setCartOpen(false);
      setCustomerName(''); setCustomerPhone(''); setStreet(''); setHouse(''); setApartment(''); setComment(''); setNoDoorDelivery(false);
    } catch (e) { console.error('Error creating order:', e); toast.error('Ошибка при оформлении заказа'); }
  }

  function formatPrice(price: number) { return price.toLocaleString('ru-RU') + ' ₸'; }
  function getFallbackImage(id: number) { return FALLBACK_IMAGES[id % FALLBACK_IMAGES.length]; }
  /** Resolve image_url (objectKey or URL) to a displayable src, with fallback */
  function getItemImage(item: { id: number; image_url: string }): string {
    const resolved = resolveImageSrc(item.image_url);
    return resolved || getFallbackImage(item.id);
  }

  function getBadgeType(item: FoodItem): 'hit' | 'new' | null {
    if (item.is_popular || item.is_recommended) return 'hit';
    if ((item.sort_order ?? 99) <= 3) return 'new';
    return null;
  }

  const modalTotalPrice = selectedItem ? selectedItem.price + calcSelectionsPrice(currentSelections) : 0;
  const modalValidation = selectedItem ? validateSelections(selectedItem.id, currentSelections) : { valid: true, errors: [] };
  const selectedItemBadge = selectedItem ? getBadgeType(selectedItem) : null;

  const promoSlideData = PROMO_SLIDES[promoSlide];

  function MenuDishRow({ item }: { item: FoodItem }) {
    const hasGroups = itemHasGroups(item.id);
    const qtyInCart = getItemQuantityInCart(item.id);
    const desc = (localized(item, 'description') || item.description || '').replace(/\s+/g, ' ').trim();
    return (
      <div className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100/90 transition-transform active:scale-[0.99]">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openItemModal(item)}>
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#111111]">{localized(item, 'name') || item.name}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-[#777777]">{desc || '\u2014'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-extrabold text-[#111111]">{formatPrice(item.price)}</span>
            {hasGroups && (
              <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-semibold text-[#777777]">{t('food.hasOptions')}</span>
            )}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button type="button" onClick={() => openItemModal(item)} className="h-20 w-20 overflow-hidden rounded-2xl bg-[#EFEFEF] ring-1 ring-gray-100">
            <img src={getItemImage(item)} alt="" className="h-full w-full object-cover" />
          </button>
          {qtyInCart > 0 ? (
            <div className="flex h-10 min-w-[108px] items-center justify-center rounded-full bg-[#F5F5F5] px-0.5 ring-1 ring-gray-200/60">
              <button type="button" onClick={() => quickRemove(item.id)} className="flex h-8 w-8 items-center justify-center rounded-full text-[#111111] active:scale-90" aria-label="-">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums">{qtyInCart}</span>
              <button type="button" onClick={() => quickAdd(item)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF3B30] text-white active:scale-90" aria-label="+">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => quickAdd(item)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF3B30] text-white shadow-md shadow-[#FF3B30]/25 active:scale-95"
              aria-label={t('food.addToCart')}
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] bg-white">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-[#FF3B30] rounded-full animate-spin" />
              <Utensils className="absolute inset-0 m-auto w-6 h-6 text-[#FF3B30]" />
            </div>
            <p className="text-[#777777] font-medium">{t('common.loading')}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-[#F5F5F5] text-[#111111]">
        {/* Баннер акций (слайдер) */}
        <section className="relative mx-auto max-w-lg overflow-hidden rounded-b-3xl md:max-w-3xl lg:max-w-5xl">
          <div className="absolute inset-0 bg-[#0b0b0d]" />
          <div className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#FF3B30]/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 top-0 h-44 w-44 rounded-full bg-violet-600/30 blur-3xl" />
          <div className="relative z-10 min-h-[200px] px-5 py-8">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Sortirovka 24</p>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight text-white md:text-[26px]">{t(promoSlideData.titleKey as 'food.promoSlide1Title')}</h1>
            <ul className="mt-5 space-y-2.5">
              {promoSlideData.linesKeys.map(key => (
                <li key={key} className="flex items-center gap-3 text-[15px] font-medium text-white/95">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#FF3B30]" />
                  {t(key as 'food.promoLine1a')}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex justify-center gap-2">
              {PROMO_SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Promo ${i + 1}`}
                  onClick={() => setPromoSlide(i)}
                  className={`h-2 rounded-full transition-all ${i === promoSlide ? 'w-8 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                />
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-lg space-y-8 px-4 pb-32 pt-6 md:max-w-3xl lg:max-w-5xl">
          {/* Категории: сетка 2 / 4, без горизонтального скролла */}
          <section>
            <h2 className="mb-3 text-lg font-extrabold tracking-tight">{t('food.categories')}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {sortedNavCategories.map(cat => {
                const slug = categorySlugOf(cat);
                const preview = poolItems.find(i => i.category_id === cat.id);
                const catImg = (cat.image || '').trim() ? resolveImageSrc(cat.image!) : '';
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategorySlug(slug)}
                    className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98] ${
                      isGridCategoryActive(slug) ? 'border-[#FF3B30] ring-2 ring-[#FF3B30]/20' : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="mb-2 aspect-[4/3] overflow-hidden rounded-xl bg-[#F0F0F0]">
                      {catImg ? (
                        <img src={catImg} alt="" className="h-full w-full object-cover" />
                      ) : preview ? (
                        <img src={getItemImage(preview)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl">{(cat.icon || '').trim() || '🍽'}</div>
                      )}
                    </div>
                    <span className="text-sm font-bold leading-tight">{localized(cat, 'name') || cat.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedCategorySlug('all')}
                className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98] ${
                  isGridCategoryActive('all') ? 'border-[#FF3B30] ring-2 ring-[#FF3B30]/20' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="mb-2 aspect-[4/3] overflow-hidden rounded-xl bg-[#F0F0F0]">
                  <img src={getFallbackImage(0)} alt="" className="h-full w-full object-cover opacity-90" />
                </div>
                <span className="text-sm font-bold leading-tight">{t('food.allMenu')}</span>
              </button>
            </div>
          </section>

          {/* Популярное */}
          {showRecommendations && recommendedItems.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-extrabold tracking-tight">{t('food.popularNow')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {recommendedItems.slice(0, 6).map(item => {
                  const qtyInCart = getItemQuantityInCart(item.id);
                  return (
                    <div key={item.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      <button type="button" onClick={() => openItemModal(item)} className="relative block aspect-square w-full bg-[#ECECEC]">
                        <img src={getItemImage(item)} alt="" className="h-full w-full object-cover" />
                        {qtyInCart > 0 && <InCartOverlay qty={qtyInCart} />}
                      </button>
                      <div className="p-3">
                        <p className="line-clamp-2 text-sm font-bold leading-snug">{localized(item, 'name') || item.name}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold">{formatPrice(item.price)}</span>
                          <button
                            type="button"
                            onClick={() => quickAdd(item)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF3B30] text-white active:scale-95"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Комбо / выгодно */}
          <section className="rounded-3xl bg-gradient-to-br from-[#111111] via-[#1c1c1c] to-[#2a1f35] p-5 text-white shadow-lg ring-1 ring-black/5">
            <h2 className="mb-4 text-lg font-extrabold">{t('food.comboDeals')}</h2>
            {comboItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {comboItems.slice(0, 6).map(item => {
                  const qtyInCart = getItemQuantityInCart(item.id);
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-sm backdrop-blur-sm"
                    >
                      <button type="button" onClick={() => openItemModal(item)} className="relative block aspect-[5/3] w-full bg-black/20">
                        <img src={getItemImage(item)} alt="" className="h-full w-full object-cover opacity-95" />
                        {qtyInCart > 0 && <InCartOverlay qty={qtyInCart} />}
                      </button>
                      <div className="p-3">
                        <p className="line-clamp-2 text-sm font-bold leading-snug">{localized(item, 'name') || item.name}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold">{formatPrice(item.price)}</span>
                          <button
                            type="button"
                            onClick={() => quickAdd(item)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF3B30] text-white active:scale-95"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm"
                  >
                    <p className="text-[15px] font-bold leading-snug">{t(`food.comboCard${i}` as 'food.comboCard1')}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/70">{t(`food.comboCard${i}Sub` as 'food.comboCard1Sub')}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Основное меню */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
                <Utensils className="h-5 w-5 text-[#777777]" />
              </div>
              <h2 className="flex-1 text-lg font-extrabold leading-tight">{t('food.mainMenu')}</h2>
            </div>

            {showGroupedMenu ? (
              menuSections.length > 0 ? (
                <div className="space-y-8">
                  {menuSections.map(({ cat, items: secItems }) => (
                    <div key={cat.id}>
                      <h3 className="mb-3 text-base font-extrabold text-[#111111]">{localized(cat, 'name') || cat.name}</h3>
                      <div className="space-y-2.5">
                        {secItems.map(item => (
                          <MenuDishRow key={item.id} item={item} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-100 bg-[#F7F7F7] p-10 text-center">
                  <Utensils className="mx-auto mb-3 h-10 w-10 text-[#777777]" />
                  <p className="font-medium text-[#111111]">{t('food.noDishes')}</p>
                  <p className="mt-2 text-sm text-[#777777]">{t('food.noDishesHint')}</p>
                </div>
              )
            ) : sortedFilteredItems.length > 0 ? (
              <div className="space-y-2.5">
                <p className="mb-2 text-sm font-semibold text-[#777777]">{activeCategoryLabel}</p>
                {sortedFilteredItems.map(item => (
                  <MenuDishRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-[#F7F7F7] p-10 text-center">
                <Utensils className="mx-auto mb-3 h-10 w-10 text-[#777777]" />
                <p className="font-medium text-[#111111]">{t('food.noDishes')}</p>
                <p className="mt-2 text-sm text-[#777777]">{t('food.noDishesHint')}</p>
              </div>
            )}
          </section>
        </div>

        {/* ═══ PRODUCT POPUP MODAL ═══ */}
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => setSelectedItem(null)}>
            <div
              className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[22px] bg-[#FAFAFA] animate-in slide-in-from-bottom duration-300 sm:rounded-[22px]"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-white px-3 pb-1 pt-3 sm:rounded-t-[22px]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#ECECEC]">
                  <img src={getItemImage(selectedItem)} alt={selectedItem.name} className="h-full w-full object-cover" />
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
            </div>
          </div>
        )}

        {/* ═══ FLOATING CART BUTTON ═══ */}
        {cartCount > 0 && !cartOpen && !checkoutOpen && !selectedItem && (
          <div className="fixed bottom-5 left-4 right-4 z-40 mx-auto max-w-lg animate-in slide-in-from-bottom duration-300 md:max-w-3xl lg:max-w-5xl">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="group flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-lg transition-all hover:bg-[#fafafa] active:scale-[0.99]"
            >
              <span className="text-[15px] font-bold text-[#111111]">
                {cartBarLabel}
                <span className="text-[#777777] font-semibold"> • </span>
                {formatPrice(cartTotalWithService)}
              </span>
              <span className="flex items-center gap-1 rounded-xl bg-[#F7F7F7] px-3 py-2 text-sm font-semibold text-[#111111] group-hover:bg-[#F0F0F0]">
                {t('food.cart')}
                <ChevronRight className="h-4 w-4 text-[#777777]" />
              </span>
            </button>
          </div>
        )}

        {/* ═══ CART DRAWER ═══ */}
        {cartOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setCartOpen(false)}>
            <div
              className="bg-[#f5f5f5] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-center relative p-5 bg-white rounded-t-3xl border-b border-gray-100">
                <h2 className="text-lg font-extrabold text-[#111111]">{t('food.yourOrder')}</h2>
                <button type="button" onClick={() => setCartOpen(false)} className="absolute right-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center hover:bg-gray-200 transition-colors text-[#111111]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.map((ci, idx) => {
                  const modTotal = calcSelectionsPrice(ci.selections);
                  const selNames = getSelectionNames(ci.selections);
                  const linePrice = (ci.item.price + modTotal) * ci.quantity;
                  return (
                    <div key={idx} className="relative bg-white rounded-2xl p-4 ring-1 ring-gray-100/80">
                      <button
                        type="button"
                        onClick={() => removeCartLine(idx)}
                        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-[#777777] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors"
                        aria-label={t('common.close')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="flex gap-3 pr-8">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#F0F0F0] ring-1 ring-gray-100">
                          <img src={getItemImage(ci.item)} alt={ci.item.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold leading-snug text-[#111111] line-clamp-2">{ci.item.name}</h4>
                          <p className="mt-0.5 text-xs text-[#777777]">{itemDisplayWeight(ci.item)}</p>
                          {ci.item.description && (
                            <p className="mt-1 text-[11px] leading-snug text-[#777777] line-clamp-2">{ci.item.description}</p>
                          )}
                          {selNames.length > 0 && (
                            <p className="mt-1 text-[11px] text-[#FF3B30] line-clamp-1">+ {selNames.join(', ')}</p>
                          )}
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-[#111111]">{formatPrice(linePrice)}</span>
                            <div className="flex h-9 items-center gap-0 rounded-full bg-[#F0F0F0] px-1 ring-1 ring-gray-100/80">
                              <button type="button" onClick={() => updateQuantity(idx, -1)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#111111] hover:bg-white/90 active:scale-95 transition">
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-[1.25rem] text-center text-sm font-bold tabular-nums">{ci.quantity}</span>
                              <button type="button" onClick={() => updateQuantity(idx, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FF3B30] text-white hover:bg-[#E6352B] active:scale-95 transition">
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {cartSuggestions.length > 0 && (
                  <div className="pt-3">
                    <h4 className="mb-3 px-0.5 text-base font-extrabold text-[#111111]">{t('food.addToOrder')}</h4>
                    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                      {cartSuggestions.map(item => (
                        <div key={item.id} className="w-[132px] shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100/80">
                          <div className="aspect-square overflow-hidden bg-[#F0F0F0]">
                            <img src={getItemImage(item)} alt={item.name} className="h-full w-full object-cover" />
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs font-bold leading-tight text-[#111111] line-clamp-2">{item.name}</p>
                            <p className="mt-1 text-[10px] font-semibold text-[#FF3B30] line-clamp-1">
                              {itemMetaTags(item).slice(0, 2).map((tag, i) => (
                                <span key={tag}>{i > 0 ? ' • ' : ''}{tag}</span>
                              ))}
                            </p>
                            <div className="mt-2 flex items-center justify-between gap-1">
                              <span className="text-xs font-extrabold text-[#111111]">{formatPrice(item.price)}</span>
                              <button
                                type="button"
                                onClick={() => quickAdd(item)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF3B30] text-white shadow-sm active:scale-90 transition-transform"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-b-3xl bg-white p-5 pt-4 ring-1 ring-gray-100/80">
                <div className="flex justify-between text-sm">
                  <span className="text-[#777777]">{t('food.subtotal')}</span>
                  <span className="font-semibold text-[#111111]">{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#777777]">{t('food.serviceFee')}</span>
                  <span className="font-semibold text-[#111111]">{formatPrice(serviceFeeAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-extrabold text-[#111111]">
                  <span>{t('food.total')}</span>
                  <span>{formatPrice(cartTotalWithService)}</span>
                </div>
                {minOrder > 0 && cartTotal < minOrder && (
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                    {t('food.minOrder')}: {formatPrice(minOrder)}
                  </div>
                )}
                <Button
                  onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                  className="h-14 w-full rounded-2xl bg-[#FF3B30] text-base font-bold text-white hover:bg-[#E6352B] active:scale-[0.98] transition-all"
                  disabled={cartTotal < minOrder}
                >
                  {t('food.checkout')} — {formatPrice(cartTotalWithService)}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ CHECKOUT MODAL ═══ */}
        {checkoutOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setCheckoutOpen(false)}>
            <div
              className="bg-[#f5f5f5] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 bg-white rounded-t-3xl">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setCheckoutOpen(false); setCartOpen(true); }} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-xl font-extrabold text-gray-900">{t('food.checkout')}</h2>
                </div>
                <button onClick={() => setCheckoutOpen(false)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <label className="text-sm font-bold text-gray-800 mb-3 block">Способ получения</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`p-4 rounded-2xl border-2 text-center transition-all duration-200 ${
                        deliveryMethod === 'delivery'
                          ? 'border-[#FF3B30] bg-red-50 shadow-sm'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                      }`}
                    >
                      <Truck className={`w-6 h-6 mx-auto mb-1.5 ${deliveryMethod === 'delivery' ? 'text-[#FF3B30]' : 'text-gray-400'}`} />
                      <span className={`text-sm font-bold block ${deliveryMethod === 'delivery' ? 'text-[#FF3B30]' : 'text-gray-600'}`}>{t('food.delivery')}</span>
                      <span className="text-xs text-gray-400">
                        {deliveryZones.length > 0 ? `от ${formatPrice(Math.min(...deliveryZones.map(z => z.price)))}` : formatPrice(parseInt(settings.delivery_price) || 0)}
                      </span>
                    </button>
                    <button
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`p-4 rounded-2xl border-2 text-center transition-all duration-200 ${
                        deliveryMethod === 'pickup'
                          ? 'border-[#FF3B30] bg-red-50 shadow-sm'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                      }`}
                    >
                      <Store className={`w-6 h-6 mx-auto mb-1.5 ${deliveryMethod === 'pickup' ? 'text-[#FF3B30]' : 'text-gray-400'}`} />
                      <span className={`text-sm font-bold block ${deliveryMethod === 'pickup' ? 'text-[#FF3B30]' : 'text-gray-600'}`}>{t('food.pickup')}</span>
                      <span className="text-xs text-gray-400">{t('food.free')}</span>
                    </button>
                  </div>
                </div>

                {/* Delivery zones selection */}
                {deliveryMethod === 'delivery' && deliveryZones.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <label className="text-sm font-bold text-gray-800 mb-2.5 block flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#FF3B30]" /> Зона доставки
                    </label>
                    <div className="space-y-2">
                      {deliveryZones.map((zone, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedZoneIndex(idx)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                            selectedZoneIndex === idx
                              ? 'border-[#FF3B30] bg-red-50'
                              : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selectedZoneIndex === idx ? 'border-[#FF3B30]' : 'border-gray-300'
                            }`}>
                              {selectedZoneIndex === idx && <div className="w-2.5 h-2.5 rounded-full bg-[#FF3B30]" />}
                            </div>
                            <div className="text-left">
                              <span className="text-sm font-semibold text-gray-800">{zone.name}</span>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-[#FF3B30]">+{formatPrice(zone.price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact info */}
                <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                  <label className="text-sm font-bold text-gray-800 block">Контактные данные</label>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      {t('food.yourName')} *
                    </label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Введите имя" className="rounded-xl h-11 border-gray-200 focus:border-[#FF3B30]" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{t('food.phone')} *</label>
                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+7 (___) ___-__-__" className="rounded-xl h-11 border-gray-200 focus:border-[#FF3B30]" />
                  </div>

                  {/* Split address fields */}
                  {deliveryMethod === 'delivery' && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Улица *</label>
                        <Input value={street} onChange={e => setStreet(e.target.value)} placeholder="Название улицы" className="rounded-xl h-11 border-gray-200 focus:border-[#FF3B30]" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Дом *</label>
                          <Input value={house} onChange={e => setHouse(e.target.value)} placeholder="Номер дома" className="rounded-xl h-11 border-gray-200 focus:border-[#FF3B30]" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Квартира</label>
                          <Input value={apartment} onChange={e => setApartment(e.target.value)} placeholder="Необязательно" className="rounded-xl h-11 border-gray-200 focus:border-[#FF3B30]" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={noDoorDelivery}
                          onChange={e => setNoDoorDelivery(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[#FF3B30] focus:ring-[#FF3B30]"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700">До подъезда</span>
                          <span className="text-[11px] text-gray-400 block">Без доставки до квартиры</span>
                        </div>
                      </label>
                    </>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{t('food.comment')}</label>
                    <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Пожелания к заказу..." className="rounded-xl resize-none border-gray-200 focus:border-[#FF3B30]" rows={2} />
                  </div>
                </div>

                {/* Order summary */}
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <h4 className="font-bold text-gray-800 text-sm mb-3">{t('food.yourOrder')}</h4>
                  <div className="space-y-2.5">
                    {cart.map((ci, idx) => {
                      const modTotal = calcSelectionsPrice(ci.selections);
                      const selNames = getSelectionNames(ci.selections);
                      return (
                        <div key={idx} className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 font-medium">{ci.item.name} × {ci.quantity}</span>
                            {selNames.length > 0 && (
                              <span className="text-[11px] text-[#FF3B30] block">+ {selNames.join(', ')}</span>
                            )}
                          </div>
                          <span className="font-bold text-sm text-gray-900 whitespace-nowrap ml-3">{formatPrice((ci.item.price + modTotal) * ci.quantity)}</span>
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
                      <span className="text-gray-500">{t('food.serviceFee')}</span>
                      <span className="font-semibold text-gray-900">{formatPrice(serviceFeeAmount)}</span>
                    </div>
                    {deliveryMethod === 'delivery' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5" /> {t('food.delivery')}
                          {deliveryZones.length > 0 && deliveryZones[selectedZoneIndex] && (
                            <span className="text-[10px] text-gray-400">({deliveryZones[selectedZoneIndex].name})</span>
                          )}
                        </span>
                        <span className="font-semibold text-[#FF3B30]">+{formatPrice(activeDeliveryPrice)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-2 text-base">
                      <span className="font-extrabold text-gray-900">{t('food.total')}</span>
                      <span className="font-extrabold text-[#FF3B30]">{formatPrice(checkoutGrandTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-white rounded-b-3xl">
                <Button
                  onClick={submitOrder}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 text-base font-bold text-white shadow-lg shadow-green-200/50 transition-all hover:bg-green-700 active:scale-[0.98]"
                >
                  <MessageSquare className="h-5 w-5" />
                  {t('food.sendOrder')} {t('food.viaWhatsApp')}
                </Button>
                <p className="mt-2.5 text-center text-[11px] text-gray-400">{t('food.checkoutWhatsAppHint')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}