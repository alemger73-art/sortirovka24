import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { resolveImageSrc } from '@/lib/storage';
import {
  ShoppingCart, Plus, Minus, X, Utensils, Truck, Store,
  ChevronRight, Phone, MapPin, MessageSquare, Star, Clock,
  ArrowLeft, Check, Search,
  AlertCircle, TreePine, Home,
} from 'lucide-react';
import ParkMap from '@/components/ParkMap';
import type { ParkPoint } from '@/components/ParkMap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { pushCabinetItem, requireAuthDialog } from '@/lib/localAuth';

/* ─── CDN images ─── */
const HERO_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/615378ae-f490-4345-9544-e4ae6d37b614.png';
/** Локальный референс премиального hero (Tasko) — лежит в `public/` */
const HERO_REF_LOCAL = '/food-hero-reference.png';
const FALLBACK_FOOD_1 = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png';
const FALLBACK_FOOD_2 = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png';
const FALLBACK_IMAGES = [FALLBACK_FOOD_1, FALLBACK_FOOD_2];

/* ─── Types ─── */
interface FoodCategory { id: number; name: string; icon: string; sort_order: number; is_active: boolean; }
interface FoodItem { id: number; category_id: number; name: string; description: string; price: number; image_url: string; is_active: boolean; is_recommended: boolean; weight: string; sort_order: number; available_in_park?: boolean; }
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

function ItemMetaLine({ item }: { item: FoodItem }) {
  const tags = itemMetaTags(item);
  return (
    <p className="text-[11px] leading-snug mt-1">
      <span className="text-[#777777]">{itemDisplayWeight(item)}</span>
      {tags.map((tag, i) => (
        <span key={tag}>
          <span className="text-[#777777]"> • </span>
          <span className="text-[#FF3B30] font-semibold">{tag}</span>
        </span>
      ))}
    </p>
  );
}

/** Сетка категорий: сопоставление с API и fallback по ключевым словам в названии блюда */
const MENU_CATEGORY_DEFS: {
  key: string;
  emoji: string;
  i18nKey: string;
  catHints: string[];
  itemKeywords: string[];
}[] = [
  { key: 'fastfood', emoji: '🍔', i18nKey: 'food.cat.fastfood', catHints: ['фаст', 'бургер', 'пицц', 'шаурма', 'хот-дог', 'хотдог', 'сэндвич'], itemKeywords: ['бургер', 'пицц', 'шаурма', 'хот-дог', 'хотдог', 'сэндвич', 'фри', 'наггет', 'твистер'] },
  { key: 'bbq', emoji: '🍢', i18nKey: 'food.cat.bbq', catHints: ['шашлык', 'мангал', 'гриль', 'кебаб'], itemKeywords: ['шашлык', 'мангал', 'гриль', 'кебаб', 'люля', 'каре'] },
  { key: 'drinks', emoji: '🥤', i18nKey: 'food.cat.drinks', catHints: ['напит', 'сок', 'лимонад', 'чай', 'кофе'], itemKeywords: ['сок', 'кола', 'лимонад', 'морс', 'чай', 'кофе', 'напит', 'вода', 'энерг'] },
  { key: 'cocktails', emoji: '🍹', i18nKey: 'food.cat.cocktails', catHints: ['коктейл', 'бар', 'мохито', 'айс'], itemKeywords: ['коктейл', 'мохито', 'дайкири', 'смузи', 'бар'] },
  { key: 'bakery', emoji: '🥟', i18nKey: 'food.cat.bakery', catHints: ['выпечк', 'хлеб', 'булоч', 'пирог', 'самса'], itemKeywords: ['самса', 'беляш', 'пирог', 'булоч', 'хлеб', 'лепёш', 'лепеш', 'чебур', 'бауырсак'] },
  { key: 'hot', emoji: '🍚', i18nKey: 'food.cat.hot', catHints: ['горяч', 'втор', 'основ', 'блюд'], itemKeywords: ['плов', 'борщ', 'суп', 'котлет', 'мясо', 'рыба', 'лапша', 'гуляш', 'рагу'] },
  { key: 'salads', emoji: '🥗', i18nKey: 'food.cat.salads', catHints: ['салат'], itemKeywords: ['салат', 'винегрет', 'цезарь', 'греческ'] },
  { key: 'sides', emoji: '🍟', i18nKey: 'food.cat.sides', catHints: ['гарнир'], itemKeywords: ['гарнир', 'картоф', 'рис', 'гречк', 'каша', 'фри'] },
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
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [currentSelections, setCurrentSelections] = useState<CartItemSelection>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [menuFilterKey, setMenuFilterKey] = useState<string | null>(null);
  const [deliveryDestination, setDeliveryDestination] = useState<'home' | 'park'>('home');
  const [parkPoints, setParkPoints] = useState<ParkPoint[]>([]);
  const [selectedParkPoint, setSelectedParkPoint] = useState<ParkPoint | null>(null);
  const [parkNote, setParkNote] = useState('');

  // Checkout form - split address
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [apartment, setApartment] = useState('');
  const [noDoorDelivery, setNoDoorDelivery] = useState(false);
  const [comment, setComment] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [kbjuMode, setKbjuMode] = useState<'100' | 'portion'>('100');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const CACHE_TTL = 5 * 60 * 1000;
    const cq = (key: string, fn: () => Promise<any>) => fetchWithCache(`food_${key}`, () => withRetry(fn), CACHE_TTL);
    try {
      const results = await Promise.allSettled([
        cq('categories', () => client.entities.food_categories.query({ sort: 'sort_order', limit: 50 })),
        cq('items', () => client.entities.food_items.query({ sort: 'sort_order', limit: 200 })),
        cq('mod_groups', () => client.entities.modifier_groups.query({ sort: 'sort_order', limit: 100 })),
        cq('mod_options', () => client.entities.modifier_options.query({ sort: 'sort_order', limit: 500 })),
        cq('item_groups', () => client.entities.item_modifier_groups.query({ limit: 500 })),
        cq('settings', () => client.entities.food_settings.query({ limit: 50 })),
        cq('park_points', () => client.entities.park_points.query({ sort: 'sort_order', limit: 50 })),
      ]);
      const extract = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value?.data?.items || []) : [];
      const cats = extract(results[0]).filter((c: FoodCategory) => c.is_active);
      setCategories(cats);
      setActiveCategory(null);
      setMenuFilterKey(null);
      setParkPoints(extract(results[6]).filter((p: ParkPoint) => p.is_active));
      setItems(extract(results[1]).filter((i: FoodItem) => i.is_active));
      setModGroups(extract(results[2]).filter((g: ModifierGroup) => g.is_active));
      setModOptions(extract(results[3]).filter((o: ModifierOption) => o.is_active));
      setItemGroupLinks(extract(results[4]));
      const settingsArr = extract(results[5]);
      const s: Record<string, string> = {};
      settingsArr.forEach((item: any) => { if (item.setting_key && item.setting_value) s[item.setting_key] = item.setting_value; });
      setSettings(prev => ({ ...prev, ...s }));
    } catch (e) { console.error('Error loading food data:', e); } finally { setLoading(false); }
  }

  // Parse delivery zones from settings
  const deliveryZones: DeliveryZone[] = useMemo(() => {
    try {
      const parsed = JSON.parse(settings.delivery_zones || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [settings.delivery_zones]);

  const poolItems = useMemo(() => {
    if (deliveryDestination !== 'park') return items;
    const parkOnly = items.filter(i => i.available_in_park);
    return parkOnly.length > 0 ? parkOnly : items;
  }, [items, deliveryDestination]);

  const filteredItems = useMemo(() => {
    let result = poolItems;
    if (activeCategory !== null) {
      result = result.filter(i => i.category_id === activeCategory);
    } else if (menuFilterKey) {
      const def = MENU_CATEGORY_DEFS.find(d => d.key === menuFilterKey);
      if (def) {
        result = result.filter(i => {
          const blob = `${i.name} ${i.description || ''}`.toLowerCase();
          return def.itemKeywords.some(k => blob.includes(k));
        });
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
    }
    return result;
  }, [poolItems, activeCategory, menuFilterKey, searchQuery]);

  const sortedFilteredItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => Number(b.is_recommended) - Number(a.is_recommended));
  }, [filteredItems]);
  const recommendedItems = useMemo(
    () => poolItems.filter(i => i.is_recommended).slice(0, 6),
    [poolItems]
  );
  const categoryPreviewMap = useMemo(() => {
    const map: Record<string, FoodItem | null> = {};
    for (const def of MENU_CATEGORY_DEFS) {
      const match = poolItems.find(i => {
        const blob = `${i.name} ${i.description || ''}`.toLowerCase();
        return def.itemKeywords.some(k => blob.includes(k));
      });
      map[def.key] = match || null;
    }
    return map;
  }, [poolItems]);

  function selectMenuCategoryTile(key: string | null) {
    setSearchQuery('');
    if (key === null) {
      setActiveCategory(null);
      setMenuFilterKey(null);
      return;
    }
    const def = MENU_CATEGORY_DEFS.find(d => d.key === key);
    if (!def) return;
    const catMatch = categories.find(c => {
      const n = c.name.toLowerCase();
      return def.catHints.some(h => n.includes(h));
    });
    if (catMatch) {
      setActiveCategory(catMatch.id);
      setMenuFilterKey(null);
    } else {
      setActiveCategory(null);
      setMenuFilterKey(key);
    }
  }

  const activeCategoryLabel = useMemo(() => {
    if (activeCategory !== null) {
      const c = categories.find(x => x.id === activeCategory);
      return (c && (localized(c, 'name') || c.name)) || t('food.allDishes');
    }
    if (menuFilterKey) {
      const def = MENU_CATEGORY_DEFS.find(d => d.key === menuFilterKey);
      return def ? t(def.i18nKey as any) : t('food.allDishes');
    }
    return t('food.allDishes');
  }, [activeCategory, menuFilterKey, categories, localized, t]);

  const showRecommendations = settings.show_recommendations !== 'false';

  function isGridCategoryActive(key: string): boolean {
    if (key === 'all') return activeCategory === null && menuFilterKey === null;
    const def = MENU_CATEGORY_DEFS.find(d => d.key === key);
    if (!def) return false;
    if (menuFilterKey === key) return true;
    const catMatch = categories.find(c => def.catHints.some(h => c.name.toLowerCase().includes(h)));
    return catMatch ? activeCategory === catMatch.id : false;
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

  // Delivery price calculation based on zones
  const calculatedDeliveryPrice = useMemo(() => {
    if (deliveryMethod !== 'delivery') return 0;
    if (deliveryZones.length > 0) {
      // Default to first zone if no specific zone selected
      return deliveryZones[0]?.price || parseInt(settings.delivery_price) || 0;
    }
    return parseInt(settings.delivery_price) || 0;
  }, [deliveryMethod, deliveryZones, settings.delivery_price]);

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
    if (deliveryDestination === 'park') return cartTotalWithService;
    if (deliveryMethod === 'delivery') return cartTotalWithService + activeDeliveryPrice;
    return cartTotalWithService;
  }, [deliveryDestination, deliveryMethod, cartTotalWithService, activeDeliveryPrice]);

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

  // Get recommendations for product popup
  const getRecommendationsForItem = useCallback((item: FoodItem): FoodItem[] => {
    const candidates = items.filter(i =>
      i.id !== item.id && i.is_active &&
      (i.is_recommended || i.category_id === item.category_id)
    );
    // Shuffle and take 4
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [items]);

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

    if (deliveryDestination === 'park') {
      if (!selectedParkPoint) { toast.error(t('food.selectParkPoint')); return; }
      if (!parkNote.trim()) { toast.error(t('food.parkLandmarkRequired')); return; }
      const orderItems = cart.map(ci => {
        const selNames = getSelectionNames(ci.selections);
        const modTotal = calcSelectionsPrice(ci.selections);
        const name = selNames.length ? `${ci.item.name} + ${selNames.join(', ')}` : ci.item.name;
        return { name, price: ci.item.price + modTotal, quantity: ci.quantity };
      });
      const total = cartTotalWithService;
      try {
        await withRetry(() => client.entities.park_orders.create({
          data: {
            order_items: JSON.stringify(orderItems),
            total_amount: total,
            customer_name: customerName.trim() || 'Клиент',
            customer_phone: customerPhone.trim(),
            park_point_id: selectedParkPoint.id,
            park_point_name: selectedParkPoint.name,
            park_lat: selectedParkPoint.lat,
            park_lng: selectedParkPoint.lng,
            park_note: parkNote.trim(),
            user_geolocation: '{}',
            status: 'new',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        }));
        pushCabinetItem('foodOrders', {
          title: `${t('food.deliveryPark')} · ${total.toLocaleString('ru-RU')} ₸`,
          subtitle: selectedParkPoint.name,
          status: 'Новый',
        });
        toast.success('Заказ в парк оформлен!');
        setCart([]); setCheckoutOpen(false); setCartOpen(false);
        setCustomerName(''); setCustomerPhone(''); setStreet(''); setHouse(''); setApartment(''); setComment(''); setNoDoorDelivery(false);
        setParkNote('');
      } catch (e) { console.error('Error creating park order:', e); toast.error('Ошибка при оформлении заказа'); }
      return;
    }

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
      await withRetry(() => client.entities.food_orders.create({
        data: {
          order_items: JSON.stringify(orderItems), total_amount: total,
          customer_name: customerName, customer_phone: customerPhone,
          delivery_address: fullAddress, comment, delivery_method: deliveryMethod,
          status: 'new', created_at: new Date().toISOString()
        }
      }));
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
    if (item.is_recommended) return 'hit';
    if ((item.sort_order ?? 99) <= 3) return 'new';
    return null;
  }

  const modalTotalPrice = selectedItem ? selectedItem.price + calcSelectionsPrice(currentSelections) : 0;
  const modalValidation = selectedItem ? validateSelections(selectedItem.id, currentSelections) : { valid: true, errors: [] };
  const modalRecommendations = selectedItem ? getRecommendationsForItem(selectedItem) : [];
  const selectedItemBadge = selectedItem ? getBadgeType(selectedItem) : null;
  useEffect(() => {
    if (selectedItem) setKbjuMode('100');
  }, [selectedItem?.id]);

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

  const heroImageSrc = settings.hero_banner_image || HERO_REF_LOCAL || HERO_IMG;

  return (
    <Layout>
      <div className="min-h-screen text-[#111111] bg-[#F5F5F5]">
        {/* ═══ HERO (как Tasko: тёмный блок + лёгкое «свечение» + карусель-точки) ═══ */}
        <section className="relative mx-auto max-w-lg md:max-w-3xl lg:max-w-5xl overflow-hidden rounded-b-[20px] min-h-[200px] max-h-[240px] md:max-h-[220px]">
          <div className="absolute inset-0 bg-[#0b0b0d]" />
          <div className="pointer-events-none absolute -top-28 -left-20 h-56 w-56 rounded-full bg-[#6d28d9]/35 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 -right-16 h-52 w-52 rounded-full bg-[#2563eb]/30 blur-3xl" />
          <div className="absolute inset-0">
            <img src={heroImageSrc} alt="" className="h-full w-full object-cover opacity-95" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/55" />
          </div>
          <div className="relative z-10 flex min-h-[200px] max-h-[240px] md:max-h-[220px] flex-col justify-end px-4 pb-6 pt-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">SORTIROVKA 24</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-white md:text-[26px]">
              {settings.hero_banner_title || 'Твои любимые блюда со скидкой каждую среду'}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85">
              {settings.hero_banner_subtitle || 'Помогут быстро выбрать то, что хочется — как в лучших приложениях доставки'}
            </p>
            <div className="mt-4 flex justify-center gap-1.5">
              {[0, 1, 2, 3, 4].map(i => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === 0 ? 'w-4 bg-white' : 'w-1.5 bg-white/35'}`}
                />
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-lg md:max-w-3xl lg:max-w-5xl px-4 pt-4 pb-32 space-y-5">
          {/* ═══ Доставка: дом / парк ═══ */}
          <div className="rounded-2xl bg-[#F7F7F7] p-1.5 shadow-sm flex gap-1">
            <button
              type="button"
              onClick={() => { setDeliveryDestination('home'); }}
              className={`flex-1 min-h-[48px] rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                deliveryDestination === 'home'
                  ? 'bg-[#FF3B30] text-white shadow-sm'
                  : 'text-[#777777] hover:text-[#111111] hover:bg-white'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <Home className="w-4 h-4 shrink-0" />
                {t('food.deliveryHome')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setDeliveryDestination('park'); }}
              className={`flex-1 min-h-[48px] rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                deliveryDestination === 'park'
                  ? 'bg-[#FF3B30] text-white shadow-sm'
                  : 'text-[#777777] hover:text-[#111111] hover:bg-white'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <TreePine className="w-4 h-4 shrink-0" />
                {t('food.deliveryPark')}
              </span>
            </button>
          </div>

          {deliveryDestination === 'park' && (
            <div className="rounded-2xl bg-[#F7F7F7] p-4 shadow-sm space-y-3">
              <p className="text-sm text-[#777777] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#FF3B30] shrink-0" />
                Выберите место в парке
              </p>
              <ParkMap
                points={parkPoints}
                selectedId={selectedParkPoint?.id ?? null}
                onSelect={setSelectedParkPoint}
                className="rounded-xl overflow-hidden border border-gray-200 bg-white"
              />
              {selectedParkPoint ? (
                <p className="text-xs text-[#111111] font-semibold">
                  ✓ {selectedParkPoint.name}
                </p>
              ) : (
                <p className="text-xs text-[#777777]">{t('food.selectParkPoint')}</p>
              )}
            </div>
          )}

          {/* ═══ КАТЕГОРИИ (сетка) ═══ */}
          <section>
            <h2 className="text-xl font-bold text-[#111111] mb-3">{t('food.categories')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectMenuCategoryTile(null)}
                className={`rounded-2xl p-3 text-left aspect-square border transition-all duration-200 active:scale-[0.98] shadow-sm ${
                  isGridCategoryActive('all')
                    ? 'bg-white border-[#FF3B30]'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="h-[78%] rounded-xl bg-[#F5F5F5] flex items-center justify-center text-4xl overflow-hidden">
                  <img src={getFallbackImage(0)} alt={t('common.all')} className="w-full h-full object-cover" />
                </div>
                <span className="text-sm font-semibold text-[#111111] leading-tight mt-2 block">{t('common.all')}</span>
              </button>
              {MENU_CATEGORY_DEFS.map(def => (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => selectMenuCategoryTile(def.key)}
                  className={`rounded-2xl p-3 text-left aspect-square border transition-all duration-200 active:scale-[0.98] shadow-sm ${
                    isGridCategoryActive(def.key)
                      ? 'bg-white border-[#FF3B30]'
                      : 'bg-white border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="h-[78%] rounded-xl bg-[#F5F5F5] flex items-center justify-center text-4xl overflow-hidden">
                    {categoryPreviewMap[def.key] ? (
                      <img src={getItemImage(categoryPreviewMap[def.key] as FoodItem)} alt={t(def.i18nKey as any)} className="w-full h-full object-cover" />
                    ) : (
                      <span>{def.emoji}</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-[#111111] leading-tight mt-2 block">{t(def.i18nKey as any)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ═══ ПОИСК ═══ */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#777777]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по меню..."
              className="w-full h-12 pl-12 pr-11 bg-[#F5F5F5] rounded-xl border border-transparent text-sm text-[#111111] placeholder:text-[#777777] focus:outline-none focus:ring-2 focus:ring-[#FF3B30]/20 focus:border-[#FF3B30]/20 transition-shadow"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center border border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4 text-[#777777]" />
              </button>
            )}
          </div>

          {showRecommendations && !searchQuery && recommendedItems.length > 0 && (
            <section>
              <h3 className="text-xl font-bold text-[#111111] mb-3 tracking-tight">А это вы пробовали?</h3>
              <div className="grid grid-cols-2 gap-3">
                {recommendedItems.map(item => {
                  const qtyInCart = getItemQuantityInCart(item.id);
                  const lineTotal = item.price * Math.max(qtyInCart, 1);
                  return (
                    <div key={`rec-${item.id}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      <div className="relative mx-2.5 mt-2.5 aspect-square overflow-hidden rounded-2xl bg-[#ECECEC]">
                        <img src={getItemImage(item)} alt={item.name} className="h-full w-full object-cover" />
                        <span className="absolute left-2 top-2">
                          <FoodBadge type="hit" />
                        </span>
                        <InCartOverlay qty={qtyInCart} className="rounded-2xl" />
                      </div>
                      <div className="px-3 pt-2.5">
                        <h4 className="line-clamp-2 text-sm font-bold leading-snug text-[#111111]">{item.name}</h4>
                        <ItemMetaLine item={item} />
                      </div>
                      <div className="p-2.5 pt-1">
                        <div className="flex h-11 items-center rounded-full bg-[#F5F5F5] px-1">
                          {qtyInCart > 0 ? (
                            <>
                              <button
                                type="button"
                                onClick={() => quickRemove(item.id)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#777777] active:scale-95"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-0 flex-1 text-center text-sm font-bold text-[#111111]">
                                {formatPrice(lineTotal)}
                              </span>
                              <button
                                type="button"
                                onClick={() => quickAdd(item)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#111111] active:scale-95"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 pl-3 text-sm font-bold text-[#111111]">{formatPrice(item.price)}</span>
                              <button
                                type="button"
                                onClick={() => quickAdd(item)}
                                className="mr-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#111111] shadow-sm active:scale-95"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ═══ СПИСОК БЛЮД ═══ */}
          <section>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-[#F5F5F5] rounded-xl flex items-center justify-center border border-gray-100">
                <Utensils className="w-4 h-4 text-[#777777]" />
              </div>
              <h2 className="text-lg font-bold text-[#111111] flex-1 leading-tight">
                {searchQuery ? `${t('common.search')}: «${searchQuery}»` : activeCategoryLabel}
              </h2>
              <span className="text-xs text-[#777777] whitespace-nowrap">{sortedFilteredItems.length}</span>
            </div>

            {sortedFilteredItems.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {sortedFilteredItems.map(item => {
                  const hasGroups = itemHasGroups(item.id);
                  const qtyInCart = getItemQuantityInCart(item.id);
                  const badgeType = getBadgeType(item);
                  const lineTotal = (item.price * Math.max(qtyInCart, 1));
                  return (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div
                        className="relative mx-2.5 mt-2.5 aspect-square cursor-pointer overflow-hidden rounded-2xl bg-[#ECECEC]"
                        onClick={() => openItemModal(item)}
                      >
                        <img src={getItemImage(item)} alt={item.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                        {badgeType && (
                          <span className="absolute left-2 top-2">
                            <FoodBadge type={badgeType} />
                          </span>
                        )}
                        {hasGroups && (
                          <span className="absolute right-2 top-2 rounded-full border border-gray-200 bg-white/95 px-2 py-0.5 text-[10px] font-bold text-[#777777]">
                            + опции
                          </span>
                        )}
                        <InCartOverlay qty={qtyInCart} className="rounded-2xl" />
                      </div>
                      <div className="px-3 pt-2.5">
                        <h3
                          className="line-clamp-2 min-h-[2.5rem] cursor-pointer text-sm font-bold leading-snug text-[#111111]"
                          onClick={() => openItemModal(item)}
                        >
                          {localized(item, 'name') || item.name}
                        </h3>
                        <ItemMetaLine item={item} />
                      </div>
                      <div className="p-2.5 pt-1">
                        <div className="flex h-11 items-center rounded-full bg-[#F5F5F5] px-1">
                          {qtyInCart > 0 ? (
                            <>
                              <button
                                type="button"
                                onClick={() => quickRemove(item.id)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#777777] active:scale-95"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-0 flex-1 text-center text-sm font-bold text-[#111111]">
                                {formatPrice(lineTotal)}
                              </span>
                              <button
                                type="button"
                                onClick={() => quickAdd(item)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#111111] active:scale-95"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 pl-3 text-sm font-bold text-[#111111]">{formatPrice(item.price)}</span>
                              <button
                                type="button"
                                onClick={() => quickAdd(item)}
                                className="mr-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#111111] shadow-sm active:scale-95"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-[#F7F7F7] rounded-2xl border border-gray-100 p-10 text-center">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
                  <Utensils className="w-8 h-8 text-[#777777]" />
                </div>
                <p className="text-[#111111] font-medium">{t('food.noDishes')}</p>
                <p className="text-[#777777] text-sm mt-2">{t('food.noDishesHint')}</p>
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
                <h3 className="text-[22px] font-extrabold leading-tight tracking-tight text-[#111111]">{selectedItem.name}</h3>
                <ItemMetaLine item={selectedItem} />
                <p className="mt-3 text-sm leading-relaxed text-[#777777]">{selectedItem.description}</p>

                <details className="mt-5 rounded-2xl border border-gray-100 bg-[#FAFAFA] p-4" open>
                  <summary className="cursor-pointer list-none text-base font-bold text-[#111111] [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between">
                      Состав и КБЖУ
                      <ChevronRight className="h-4 w-4 rotate-90 text-[#777777]" />
                    </span>
                  </summary>
                  <p className="mt-3 text-xs leading-relaxed text-[#777777]">
                    Куриное филе, шампиньоны, лук, томатный соус, моцарелла, итальянские травы — как в премиальной подаче Tasko.
                  </p>
                  <div className="mt-3 flex rounded-full bg-[#F0F0F0] p-1">
                    <button
                      type="button"
                      onClick={() => setKbjuMode('100')}
                      className={`flex-1 rounded-full py-2 text-xs font-bold transition ${kbjuMode === '100' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#777777]'}`}
                    >
                      На 100 г
                    </button>
                    <button
                      type="button"
                      onClick={() => setKbjuMode('portion')}
                      className={`flex-1 rounded-full py-2 text-xs font-bold transition ${kbjuMode === 'portion' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#777777]'}`}
                    >
                      На порцию
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {[
                      { v: kbjuMode === '100' ? '480' : '1920', l: 'ккал' },
                      { v: kbjuMode === '100' ? '25' : '100', l: 'белки' },
                      { v: kbjuMode === '100' ? '30' : '120', l: 'жиры' },
                      { v: kbjuMode === '100' ? '28' : '112', l: 'углеводы' },
                    ].map(cell => (
                      <div key={cell.l} className="rounded-xl bg-white py-2 ring-1 ring-gray-100">
                        <div className="text-lg font-extrabold text-[#111111]">{cell.v}</div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-[#777777]">{cell.l}</div>
                      </div>
                    ))}
                  </div>
                </details>

                {/* Modifier Groups — радио как горизонтальные «чипы» (Tasko) */}
                {getGroupsForItem(selectedItem.id).map((group, gIdx) => {
                  const groupOptions = getOptionsForGroup(group.id);
                  const selectedOpts = currentSelections[group.id] || [];
                  if (groupOptions.length === 0) return null;

                  return (
                    <div key={group.id} className={gIdx === 0 ? 'mt-6 border-t border-gray-100 pt-5' : 'mt-6'}>
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

                {/* Recommendations in popup */}
                {showRecommendations && modalRecommendations.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-gray-100">
                    <h4 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                      <Star className="w-4 h-4 text-[#FF3B30]" /> Рекомендуем
                    </h4>
                    <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                      {modalRecommendations.map(recItem => (
                        <button
                          key={recItem.id}
                          onClick={() => { openItemModal(recItem); }}
                          className="flex-shrink-0 w-[110px] text-left"
                        >
                          <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 mb-1.5">
                            <img src={getItemImage(recItem)} alt={recItem.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-xs font-semibold text-gray-800 line-clamp-1">{recItem.name}</p>
                          <p className="text-xs font-bold text-[#FF3B30]">{formatPrice(recItem.price)}</p>
                        </button>
                      ))}
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
          <div className="fixed bottom-5 left-4 right-4 z-40 max-w-lg mx-auto animate-in slide-in-from-bottom duration-300">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full bg-white hover:bg-[#fafafa] text-[#111111] rounded-2xl p-4 flex items-center justify-between shadow-lg border border-gray-100 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-11 h-11 bg-[#FF3B30] rounded-xl flex items-center justify-center text-white">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-base block text-[#111111]">{formatPrice(cartTotalWithService)}</span>
                  <span className="text-[#777777] text-[11px] leading-tight">{t('food.serviceFeeIncluded')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-[#F7F7F7] rounded-xl px-4 py-2.5 group-hover:bg-[#F0F0F0] transition-colors">
                <span className="font-semibold text-sm text-[#111111]">{t('food.cart')}</span>
                <ChevronRight className="w-4 h-4 text-[#777777]" />
              </div>
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
                    <h4 className="mb-3 px-0.5 text-base font-extrabold text-[#111111]">{t('food.togetherTastier')}</h4>
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
                {deliveryDestination === 'park' && (
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 space-y-2">
                    <label className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                      <TreePine className="w-4 h-4" /> {t('food.deliveryPark')}
                    </label>
                    <p className="text-sm text-emerald-800">
                      {selectedParkPoint ? (
                        <><MapPin className="w-4 h-4 inline mr-1" />{selectedParkPoint.name}</>
                      ) : (
                        <span className="text-[#FF3B30]">{t('food.selectParkPoint')}</span>
                      )}
                    </p>
                    <div>
                      <label className="text-xs font-semibold text-emerald-800 mb-1 block">{t('food.parkLandmark')} *</label>
                      <Textarea
                        value={parkNote}
                        onChange={e => setParkNote(e.target.value)}
                        placeholder="Например: скамейка у фонтана, красная куртка…"
                        className="rounded-xl resize-none border-emerald-200 focus:border-emerald-500 bg-white"
                        rows={2}
                      />
                    </div>
                  </div>
                )}

                {deliveryDestination !== 'park' && (
                <>
                {/* Delivery method */}
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
                </>
                )}

                {/* Contact info */}
                <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                  <label className="text-sm font-bold text-gray-800 block">Контактные данные</label>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      {t('food.yourName')} {deliveryDestination === 'park' ? '' : '*'}
                    </label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Введите имя" className="rounded-xl h-11 border-gray-200 focus:border-[#FF3B30]" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{t('food.phone')} *</label>
                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+7 (___) ___-__-__" className="rounded-xl h-11 border-gray-200 focus:border-[#FF3B30]" />
                  </div>

                  {/* Split address fields */}
                  {deliveryDestination !== 'park' && deliveryMethod === 'delivery' && (
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
                    {deliveryDestination !== 'park' && deliveryMethod === 'delivery' && (
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
                  className={`w-full h-14 text-base font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
                    deliveryDestination === 'park'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200/40'
                      : 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200/50'
                  }`}
                >
                  {deliveryDestination === 'park' ? <Phone className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                  {deliveryDestination === 'park' ? t('food.parkOrderSubmit') : <>{t('food.sendOrder')} {t('food.viaWhatsApp')}</>}
                </Button>
                <p className="text-[11px] text-gray-400 text-center mt-2.5">
                  {deliveryDestination === 'park'
                    ? 'Заказ уйдёт в систему доставки в парк'
                    : 'Заказ будет отправлен в WhatsApp для подтверждения'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}