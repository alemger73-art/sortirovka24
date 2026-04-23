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
  ArrowLeft, Check, Flame, Sparkles, Zap, Search,
  CircleDot, CheckSquare, AlertCircle, TreePine, Home,
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

/* ─── Badge component ─── */
function FoodBadge({ type }: { type: 'hit' | 'new' }) {
  const { t } = useLanguage();
  const config = {
    hit: { icon: <Flame className="w-3 h-3" />, text: t('food.hit'), bg: 'bg-amber-500 text-[#0b0f14]' },
    new: { icon: <Sparkles className="w-3 h-3" />, text: t('food.new'), bg: 'bg-emerald-500 text-white' },
  };
  const c = config[type];
  return (
    <span className={`${c.bg} text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md`}>
      {c.icon} {c.text}
    </span>
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

/* ─── Added-to-cart animation ─── */
function AddedFeedback({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-2xl flex items-center justify-center z-10 animate-in fade-in duration-200">
      <div className="bg-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl animate-in zoom-in duration-300">
        <Check className="w-7 h-7 text-green-500" />
      </div>
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
  const [addedItemId, setAddedItemId] = useState<number | null>(null);
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
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 800);
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
      const total = cartTotal;
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
    const total = deliveryMethod === 'delivery' ? cartTotal + activeDeliveryPrice : cartTotal;
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

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] bg-[#0b0f14]">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-yellow-400 rounded-full animate-spin" />
              <Utensils className="absolute inset-0 m-auto w-6 h-6 text-yellow-400/80" />
            </div>
            <p className="text-gray-400 font-medium">{t('common.loading')}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-[#0b0f14] min-h-screen text-gray-100">
        {/* ═══ HERO BANNER ═══ */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img src={settings.hero_banner_image || HERO_IMG} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14] via-black/40 to-transparent" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-10 md:py-16 lg:py-20">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-yellow-400 text-[#0b0f14] text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-yellow-400/20">
                  <Zap className="w-3 h-3" /> {t('food.delivery')}
                </span>
                <span className="bg-white/15 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full border border-white/10">
                  30-60 мин
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
                {settings.hero_banner_title}
              </h1>
              <p className="text-white/80 text-base md:text-lg mt-3 leading-relaxed">
                {settings.hero_banner_subtitle}
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2.5 text-white text-sm border border-white/10">
                  <Truck className="w-4 h-4 text-yellow-300" />
                  <span>{t('food.delivery')} {t('common.from')} {formatPrice(deliveryZones.length > 0 ? deliveryZones[0].price : parseInt(settings.delivery_price) || 0)}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2.5 text-white text-sm border border-white/10">
                  <Store className="w-4 h-4 text-emerald-300" />
                  <span>{t('food.pickup')} — {t('food.free')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 pt-5 pb-32 space-y-6">
          {/* ═══ Доставка: дом / парк ═══ */}
          <div className="rounded-2xl bg-[#121826] border border-white/5 p-1.5 shadow-lg shadow-black/40 flex gap-1">
            <button
              type="button"
              onClick={() => { setDeliveryDestination('home'); }}
              className={`flex-1 min-h-[48px] rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                deliveryDestination === 'home'
                  ? 'bg-yellow-400 text-[#0b0f14] shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
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
                  ? 'bg-yellow-400 text-[#0b0f14] shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <TreePine className="w-4 h-4 shrink-0" />
                {t('food.deliveryPark')}
              </span>
            </button>
          </div>

          {deliveryDestination === 'park' && (
            <div className="rounded-2xl bg-[#121826] border border-white/5 p-4 shadow-lg space-y-3">
              <p className="text-sm text-gray-300 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-yellow-400 shrink-0" />
                {t('food.selectParkPoint')}
              </p>
              <ParkMap
                points={parkPoints}
                selectedId={selectedParkPoint?.id ?? null}
                onSelect={setSelectedParkPoint}
                className="rounded-xl overflow-hidden border border-white/10 bg-[#0b0f14]"
              />
              {selectedParkPoint ? (
                <p className="text-xs text-yellow-400/90 font-semibold">
                  ✓ {selectedParkPoint.name}
                </p>
              ) : (
                <p className="text-xs text-gray-500">{t('food.selectParkPoint')}</p>
              )}
            </div>
          )}

          {/* ═══ КАТЕГОРИИ (сетка) ═══ */}
          <section>
            <h2 className="text-lg font-bold text-white mb-3 tracking-tight">{t('food.categories')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => selectMenuCategoryTile(null)}
                className={`rounded-2xl p-4 text-left min-h-[100px] border transition-all duration-200 active:scale-[0.97] shadow-md ${
                  isGridCategoryActive('all')
                    ? 'bg-yellow-400/15 border-yellow-400/50 ring-1 ring-yellow-400/40'
                    : 'bg-[#121826] border-white/5 hover:border-yellow-400/30 hover:shadow-lg hover:shadow-yellow-400/5'
                }`}
              >
                <span className="text-3xl block mb-2">🍽</span>
                <span className="text-sm font-bold text-white leading-tight">{t('common.all')}</span>
              </button>
              {MENU_CATEGORY_DEFS.map(def => (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => selectMenuCategoryTile(def.key)}
                  className={`rounded-2xl p-4 text-left min-h-[100px] border transition-all duration-200 active:scale-[0.97] shadow-md ${
                    isGridCategoryActive(def.key)
                      ? 'bg-yellow-400/15 border-yellow-400/50 ring-1 ring-yellow-400/40'
                      : 'bg-[#121826] border-white/5 hover:border-yellow-400/30 hover:shadow-lg hover:shadow-yellow-400/5'
                  }`}
                >
                  <span className="text-3xl block mb-2">{def.emoji}</span>
                  <span className="text-sm font-bold text-white leading-tight">{t(def.i18nKey as any)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ═══ ПОИСК ═══ */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('food.searchPlaceholder')}
              className="w-full min-h-[52px] pl-12 pr-11 py-3.5 bg-[#121826] rounded-2xl border border-white/10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/35 focus:border-yellow-400/40 transition-shadow"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          {/* ═══ СПИСОК БЛЮД ═══ */}
          <section>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-yellow-400/15 rounded-xl flex items-center justify-center border border-yellow-400/20">
                <Utensils className="w-4 h-4 text-yellow-400" />
              </div>
              <h2 className="text-lg font-bold text-white flex-1 leading-tight">
                {searchQuery ? `${t('common.search')}: «${searchQuery}»` : activeCategoryLabel}
              </h2>
              <span className="text-xs text-gray-500 whitespace-nowrap">{sortedFilteredItems.length}</span>
            </div>

            {sortedFilteredItems.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {sortedFilteredItems.map(item => {
                  const hasGroups = itemHasGroups(item.id);
                  const qtyInCart = getItemQuantityInCart(item.id);
                  const badgeType = getBadgeType(item);
                  return (
                    <div
                      key={item.id}
                      className="bg-[#121826] rounded-2xl border border-white/5 overflow-hidden shadow-lg shadow-black/30 hover:border-yellow-400/25 hover:shadow-xl transition-all duration-200 group relative"
                    >
                      <AddedFeedback show={addedItemId === item.id} />
                      <div
                        className="aspect-[4/3] bg-[#0b0f14] relative overflow-hidden cursor-pointer"
                        onClick={() => openItemModal(item)}
                      >
                        <img src={getItemImage(item)} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                          {badgeType && <FoodBadge type={badgeType} />}
                        </div>
                        {hasGroups && (
                          <span className="absolute top-2 right-2 bg-black/55 backdrop-blur-sm text-yellow-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10">
                            + опции
                          </span>
                        )}
                      </div>
                      <div className="p-3.5 flex flex-col gap-3">
                        <h3
                          className="font-bold text-white text-sm leading-snug line-clamp-2 cursor-pointer min-h-[2.5rem]"
                          onClick={() => openItemModal(item)}
                        >
                          {localized(item, 'name') || item.name}
                        </h3>
                        <div className="flex flex-col gap-2 mt-auto">
                          <span className="text-base font-extrabold text-yellow-400">{formatPrice(item.price)}</span>
                          {qtyInCart > 0 ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => quickRemove(item.id)}
                                className="min-h-[44px] min-w-[44px] bg-white/10 hover:bg-white/15 rounded-xl flex items-center justify-center transition-all active:scale-95"
                              >
                                <Minus className="w-4 h-4 text-gray-300" />
                              </button>
                              <span className="flex-1 text-center font-bold text-white">{qtyInCart}</span>
                              <button
                                type="button"
                                onClick={() => quickAdd(item)}
                                className="min-h-[44px] min-w-[44px] bg-yellow-400 hover:bg-yellow-300 text-[#0b0f14] rounded-xl flex items-center justify-center font-bold transition-all active:scale-95 shadow-md shadow-yellow-400/20"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => quickAdd(item)}
                              className="w-full min-h-[48px] rounded-xl bg-yellow-400 hover:bg-yellow-300 text-[#0b0f14] text-sm font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-yellow-400/15"
                            >
                              <Plus className="w-5 h-5" />
                              {t('common.add')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-[#121826] rounded-2xl border border-white/5 p-10 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Utensils className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-gray-300 font-medium">{t('food.noDishes')}</p>
                <p className="text-gray-500 text-sm mt-2">{t('food.noDishesHint')}</p>
              </div>
            )}
          </section>
        </div>

        {/* ═══ PRODUCT POPUP MODAL ═══ */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedItem(null)}>
            <div
              className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
              onClick={e => e.stopPropagation()}
            >
              {/* Big image */}
              <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                <img src={getItemImage(selectedItem)} alt={selectedItem.name} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
                <button
                  onClick={() => setSelectedItem(null)}
                  className="absolute top-4 right-4 w-9 h-9 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5">
                <h3 className="text-2xl font-extrabold text-gray-900">{selectedItem.name}</h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{selectedItem.description}</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-3">{formatPrice(selectedItem.price)}</p>

                {/* Modifier Groups */}
                {getGroupsForItem(selectedItem.id).map(group => {
                  const groupOptions = getOptionsForGroup(group.id);
                  const selectedOpts = currentSelections[group.id] || [];
                  if (groupOptions.length === 0) return null;

                  return (
                    <div key={group.id} className="mt-5">
                      <div className="flex items-center gap-2 mb-2.5">
                        {group.type === 'radio'
                          ? <CircleDot className="w-4 h-4 text-blue-500" />
                          : <CheckSquare className="w-4 h-4 text-purple-500" />
                        }
                        <h4 className="font-bold text-gray-800 text-sm">{group.name}</h4>
                        {group.is_required && (
                          <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{t('food.required')}</span>
                        )}
                      </div>
                      {group.type === 'checkbox' && (group.min_select > 0 || group.max_select < 10) && (
                        <p className="text-[11px] text-gray-400 mb-2 -mt-1">
                          {group.min_select > 0 && `Мин: ${group.min_select}`}
                          {group.min_select > 0 && group.max_select < 10 && ' • '}
                          {group.max_select < 10 && `Макс: ${group.max_select}`}
                          {' • '}Выбрано: {selectedOpts.length}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {groupOptions.map(opt => {
                          const isSelected = selectedOpts.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                if (group.type === 'radio') handleRadioSelect(group.id, opt.id);
                                else handleCheckboxToggle(group.id, opt.id, group.max_select);
                              }}
                              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all duration-200 ${
                                isSelected
                                  ? 'border-orange-500 bg-orange-50'
                                  : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                {group.type === 'radio' ? (
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isSelected ? 'border-orange-500' : 'border-gray-300'
                                  }`}>
                                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                                  </div>
                                ) : (
                                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                    isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                )}
                                <span className="font-medium text-sm text-gray-800">{opt.name}</span>
                              </div>
                              <span className="text-sm font-bold text-orange-600">
                                {opt.price > 0 ? `+${formatPrice(opt.price)}` : 'бесплатно'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
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
                      <Star className="w-4 h-4 text-orange-400" /> Рекомендуем
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
                          <p className="text-xs font-bold text-orange-600">{formatPrice(recItem.price)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={confirmAddWithSelections}
                  disabled={!modalValidation.valid}
                  className="w-full mt-5 bg-orange-500 hover:bg-orange-600 text-white h-13 text-base font-bold rounded-2xl shadow-lg shadow-orange-200/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('food.addToCart')} — {formatPrice(modalTotalPrice)}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ FLOATING CART BUTTON ═══ */}
        {cartCount > 0 && !cartOpen && !checkoutOpen && !selectedItem && (
          <div className="fixed bottom-5 left-4 right-4 z-40 max-w-lg mx-auto animate-in slide-in-from-bottom duration-300">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full bg-[#121826] hover:bg-[#161d2e] text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-black/50 border border-white/10 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-11 h-11 bg-yellow-400 rounded-xl flex items-center justify-center text-[#0b0f14]">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-base block text-yellow-400">{formatPrice(cartTotal)}</span>
                  <span className="text-white/50 text-xs">{cartCount} {cartCount === 1 ? 'товар' : cartCount < 5 ? 'товара' : 'товаров'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-yellow-400/15 rounded-xl px-4 py-2.5 group-hover:bg-yellow-400/25 transition-colors">
                <span className="font-semibold text-sm text-yellow-300">{t('food.cart')}</span>
                <ChevronRight className="w-4 h-4 text-yellow-300" />
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
              <div className="flex items-center justify-between p-5 bg-white rounded-t-3xl">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900">{t('food.cart')}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{cartCount} {cartCount === 1 ? 'товар' : cartCount < 5 ? 'товара' : 'товаров'}</p>
                </div>
                <button onClick={() => setCartOpen(false)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.map((ci, idx) => {
                  const modTotal = calcSelectionsPrice(ci.selections);
                  const selNames = getSelectionNames(ci.selections);
                  return (
                    <div key={idx} className="bg-white rounded-2xl p-3.5 shadow-sm">
                      <div className="flex gap-3">
                        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                          <img src={getItemImage(ci.item)} alt={ci.item.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{ci.item.name}</h4>
                          {selNames.length > 0 && (
                            <p className="text-[11px] text-orange-500 mt-0.5 line-clamp-1">
                              + {selNames.join(', ')}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-extrabold text-gray-900">
                              {formatPrice((ci.item.price + modTotal) * ci.quantity)}
                            </span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => updateQuantity(idx, -1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-90">
                                <Minus className="w-3 h-3 text-gray-600" />
                              </button>
                              <span className="w-5 text-center font-bold text-sm">{ci.quantity}</span>
                              <button onClick={() => updateQuantity(idx, 1)} className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors active:scale-90">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ═══ "Дополнить заказ" section ═══ */}
                {cartSuggestions.length > 0 && (
                  <div className="pt-2">
                    <h4 className="font-bold text-gray-700 text-sm mb-2.5 flex items-center gap-2 px-1">
                      <Sparkles className="w-4 h-4 text-orange-400" /> Дополнить заказ
                    </h4>
                    <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                      {cartSuggestions.map(item => (
                        <div key={item.id} className="flex-shrink-0 w-[120px] bg-white rounded-xl shadow-sm overflow-hidden">
                          <div className="aspect-square bg-gray-100 overflow-hidden">
                            <img src={getItemImage(item)} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-semibold text-gray-800 line-clamp-1">{item.name}</p>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-xs font-bold text-gray-900">{formatPrice(item.price)}</span>
                              <button
                                onClick={() => quickAdd(item)}
                                className="w-6 h-6 bg-orange-500 text-white rounded-lg flex items-center justify-center active:scale-90 transition-transform"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-5 bg-white rounded-b-3xl space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('food.total')}</span>
                  <span className="font-bold text-gray-900">{formatPrice(cartTotal)}</span>
                </div>
                {minOrder > 0 && cartTotal < minOrder && (
                  <div className="bg-red-50 text-red-600 text-xs font-medium px-3 py-2 rounded-xl">
                    {t('food.minOrder')}: {formatPrice(minOrder)}
                  </div>
                )}
                <Button
                  onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white h-13 text-base font-bold rounded-2xl shadow-lg shadow-orange-200/50 active:scale-[0.98] transition-all"
                  disabled={cartTotal < minOrder}
                >
                  {t('food.checkout')} — {formatPrice(cartTotal)}
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
                        <span className="text-amber-700">{t('food.selectParkPoint')}</span>
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
                          ? 'border-orange-500 bg-orange-50 shadow-sm'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                      }`}
                    >
                      <Truck className={`w-6 h-6 mx-auto mb-1.5 ${deliveryMethod === 'delivery' ? 'text-orange-500' : 'text-gray-400'}`} />
                      <span className={`text-sm font-bold block ${deliveryMethod === 'delivery' ? 'text-orange-700' : 'text-gray-600'}`}>{t('food.delivery')}</span>
                      <span className="text-xs text-gray-400">
                        {deliveryZones.length > 0 ? `от ${formatPrice(Math.min(...deliveryZones.map(z => z.price)))}` : formatPrice(parseInt(settings.delivery_price) || 0)}
                      </span>
                    </button>
                    <button
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`p-4 rounded-2xl border-2 text-center transition-all duration-200 ${
                        deliveryMethod === 'pickup'
                          ? 'border-orange-500 bg-orange-50 shadow-sm'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                      }`}
                    >
                      <Store className={`w-6 h-6 mx-auto mb-1.5 ${deliveryMethod === 'pickup' ? 'text-orange-500' : 'text-gray-400'}`} />
                      <span className={`text-sm font-bold block ${deliveryMethod === 'pickup' ? 'text-orange-700' : 'text-gray-600'}`}>{t('food.pickup')}</span>
                      <span className="text-xs text-gray-400">{t('food.free')}</span>
                    </button>
                  </div>
                </div>

                {/* Delivery zones selection */}
                {deliveryMethod === 'delivery' && deliveryZones.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <label className="text-sm font-bold text-gray-800 mb-2.5 block flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-orange-500" /> Зона доставки
                    </label>
                    <div className="space-y-2">
                      {deliveryZones.map((zone, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedZoneIndex(idx)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                            selectedZoneIndex === idx
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selectedZoneIndex === idx ? 'border-orange-500' : 'border-gray-300'
                            }`}>
                              {selectedZoneIndex === idx && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                            </div>
                            <div className="text-left">
                              <span className="text-sm font-semibold text-gray-800">{zone.name}</span>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-orange-600">+{formatPrice(zone.price)}</span>
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
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Введите имя" className="rounded-xl h-11 border-gray-200 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{t('food.phone')} *</label>
                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+7 (___) ___-__-__" className="rounded-xl h-11 border-gray-200 focus:border-orange-500" />
                  </div>

                  {/* Split address fields */}
                  {deliveryDestination !== 'park' && deliveryMethod === 'delivery' && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Улица *</label>
                        <Input value={street} onChange={e => setStreet(e.target.value)} placeholder="Название улицы" className="rounded-xl h-11 border-gray-200 focus:border-orange-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Дом *</label>
                          <Input value={house} onChange={e => setHouse(e.target.value)} placeholder="Номер дома" className="rounded-xl h-11 border-gray-200 focus:border-orange-500" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Квартира</label>
                          <Input value={apartment} onChange={e => setApartment(e.target.value)} placeholder="Необязательно" className="rounded-xl h-11 border-gray-200 focus:border-orange-500" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={noDoorDelivery}
                          onChange={e => setNoDoorDelivery(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
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
                    <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Пожелания к заказу..." className="rounded-xl resize-none border-gray-200 focus:border-orange-500" rows={2} />
                  </div>
                </div>

                {/* Order summary */}
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <h4 className="font-bold text-gray-800 text-sm mb-3">Ваш заказ</h4>
                  <div className="space-y-2.5">
                    {cart.map((ci, idx) => {
                      const modTotal = calcSelectionsPrice(ci.selections);
                      const selNames = getSelectionNames(ci.selections);
                      return (
                        <div key={idx} className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 font-medium">{ci.item.name} × {ci.quantity}</span>
                            {selNames.length > 0 && (
                              <span className="text-[11px] text-orange-500 block">+ {selNames.join(', ')}</span>
                            )}
                          </div>
                          <span className="font-bold text-sm text-gray-900 whitespace-nowrap ml-3">{formatPrice((ci.item.price + modTotal) * ci.quantity)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-gray-100 pt-3 mt-3 space-y-1.5">
                    {deliveryDestination !== 'park' && deliveryMethod === 'delivery' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5" /> Доставка
                          {deliveryZones.length > 0 && deliveryZones[selectedZoneIndex] && (
                            <span className="text-[10px] text-gray-400">({deliveryZones[selectedZoneIndex].name})</span>
                          )}
                        </span>
                        <span className="font-semibold text-orange-600">+{formatPrice(activeDeliveryPrice)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base pt-1">
                      <span className="font-extrabold text-gray-900">{t('food.total')}</span>
                      <span className="font-extrabold text-orange-600">
                        {formatPrice(
                          deliveryDestination === 'park'
                            ? cartTotal
                            : deliveryMethod === 'delivery'
                              ? cartTotal + activeDeliveryPrice
                              : cartTotal
                        )}
                      </span>
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