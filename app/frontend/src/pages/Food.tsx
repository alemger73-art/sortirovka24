import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { resolveImageSrc } from '@/lib/storage';
import {
  ShoppingCart, Plus, Minus, X, Utensils, Truck, Store,
  ChevronRight, Phone, MapPin, MessageSquare, Star, Clock,
  ArrowLeft, Check, Flame, Sparkles, Zap, Heart, Search,
  CircleDot, CheckSquare, AlertCircle, TreePine, Home, Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

/* ─── CDN images ─── */
const HERO_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/615378ae-f490-4345-9544-e4ae6d37b614.png';
const PROMO_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/b1f0b9af-2c81-40b8-a0f3-eb9ef82ee61e.png';
const FALLBACK_FOOD_1 = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png';
const FALLBACK_FOOD_2 = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png';
const FALLBACK_IMAGES = [FALLBACK_FOOD_1, FALLBACK_FOOD_2];

/* ─── Types ─── */
interface FoodCategory { id: number; name: string; icon: string; sort_order: number; is_active: boolean; }
interface FoodItem { id: number; category_id: number; name: string; description: string; price: number; image_url: string; is_active: boolean; is_recommended: boolean; weight: string; sort_order: number; }
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
function FoodBadge({ type }: { type: 'hit' | 'new' | 'popular' }) {
  const { t } = useLanguage();
  const config = {
    hit: { icon: <Flame className="w-3 h-3" />, text: t('food.hit'), bg: 'bg-gradient-to-r from-orange-500 to-red-500' },
    new: { icon: <Sparkles className="w-3 h-3" />, text: t('food.new'), bg: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
    popular: { icon: <Heart className="w-3 h-3" />, text: t('food.popular'), bg: 'bg-gradient-to-r from-pink-500 to-rose-500' },
  };
  const c = config[type];
  return (
    <span className={`${c.bg} text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg`}>
      {c.icon} {c.text}
    </span>
  );
}

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
  const catScrollRef = useRef<HTMLDivElement>(null);

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
      ]);
      const extract = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value?.data?.items || []) : [];
      const cats = extract(results[0]).filter((c: FoodCategory) => c.is_active);
      setCategories(cats);
      setActiveCategory(null);
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

  const filteredItems = useMemo(() => {
    let result = activeCategory === null ? items : items.filter(i => i.category_id === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return result;
  }, [items, activeCategory, searchQuery]);

  const recommendedItems = useMemo(() => items.filter(i => i.is_recommended), [items]);
  const showRecommendations = settings.show_recommendations !== 'false';

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
    if (!customerName.trim() || !customerPhone.trim()) { toast.error('Заполните имя и телефон'); return; }
    if (deliveryMethod === 'delivery' && (!street.trim() || !house.trim())) { toast.error('Укажите улицу и дом'); return; }
    if (cartTotal < minOrder) { toast.error(`${t('food.minOrder')}: ${minOrder} ₸`); return; }

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

  function getBadgeType(item: FoodItem, index: number): 'hit' | 'new' | 'popular' | null {
    if (item.is_recommended) return 'hit';
    if (index < 3) return 'new';
    if (item.sort_order <= 2) return 'popular';
    return null;
  }

  const modalTotalPrice = selectedItem ? selectedItem.price + calcSelectionsPrice(currentSelections) : 0;
  const modalValidation = selectedItem ? validateSelections(selectedItem.id, currentSelections) : { valid: true, errors: [] };
  const modalRecommendations = selectedItem ? getRecommendationsForItem(selectedItem) : [];

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] bg-[#f5f5f5]">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-orange-100 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
              <Utensils className="absolute inset-0 m-auto w-6 h-6 text-orange-400" />
            </div>
            <p className="text-gray-500 font-medium">{t('common.loading')}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-[#f5f5f5] min-h-screen">
        {/* ═══ HERO BANNER ═══ */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img src={settings.hero_banner_image || HERO_IMG} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-10 md:py-16 lg:py-20">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <Zap className="w-3 h-3" /> {t('food.delivery')}
                </span>
                <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full">
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
                  <Truck className="w-4 h-4 text-orange-400" />
                  <span>{t('food.delivery')} {t('common.from')} {formatPrice(deliveryZones.length > 0 ? deliveryZones[0].price : parseInt(settings.delivery_price) || 0)}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2.5 text-white text-sm border border-white/10">
                  <Store className="w-4 h-4 text-green-400" />
                  <span>{t('food.pickup')} — {t('food.free')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PROMO BANNER ═══ */}
        <div className="max-w-7xl mx-auto px-4 -mt-6 relative z-10">
          <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl overflow-hidden shadow-xl shadow-orange-200/30">
            <div className="flex items-center">
              <div className="flex-1 p-5 md:p-6">
                <span className="bg-white/20 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Акция
                </span>
                <h3 className="text-white font-bold text-lg md:text-xl mt-2">Скидка 20% на первый заказ!</h3>
                <p className="text-white/80 text-sm mt-1">Используйте промокод FIRST20</p>
              </div>
              <div className="hidden sm:block w-36 h-24 md:w-44 md:h-28 flex-shrink-0 mr-4">
                <img src={PROMO_IMG} alt="Promo" className="w-full h-full object-cover rounded-xl" />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ PARK DELIVERY BANNER ═══ */}
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <a
            href="/food/park"
            className="block bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl overflow-hidden shadow-lg shadow-green-200/30 hover:shadow-xl transition-all hover:-translate-y-0.5 group"
          >
            <div className="flex items-center p-4 md:p-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="bg-white/20 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <TreePine className="w-3 h-3" /> Новинка
                  </span>
                </div>
                <h3 className="text-white font-bold text-lg md:text-xl">Доставка в парк 🌳</h3>
                <p className="text-white/80 text-sm mt-0.5">Закажите еду прямо к скамейке в парке!</p>
              </div>
              <div className="flex-shrink-0 ml-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                  🌳
                </div>
              </div>
            </div>
          </a>
        </div>

        <div className="max-w-7xl mx-auto px-4 pt-6 pb-32">
          {/* ═══ SEARCH ═══ */}
          <div className="relative mb-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('food.searchPlaceholder')}
              className="w-full pl-12 pr-4 py-3.5 bg-white rounded-2xl border-0 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-shadow"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors">
                <X className="w-3 h-3 text-gray-500" />
              </button>
            )}
          </div>

          {/* ═══ CATEGORIES SCROLL ═══ */}
          <div ref={catScrollRef} className="flex gap-2.5 overflow-x-auto pb-4 mb-6 scrollbar-hide -mx-4 px-4">
            <button
              onClick={() => setActiveCategory(null)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                activeCategory === null
                  ? 'bg-gray-900 text-white shadow-lg shadow-gray-900/20 scale-105'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              🍽 {t('common.all')}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  activeCategory === cat.id
                    ? 'bg-gray-900 text-white shadow-lg shadow-gray-900/20 scale-105'
                    : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
                }`}
              >
                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
              </button>
            ))}
          </div>

          {/* ═══ POPULAR TODAY ═══ */}
          {activeCategory === null && !searchQuery && showRecommendations && recommendedItems.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Flame className="w-4 h-4 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">{t('food.recommended')}</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4">
                {recommendedItems.map(item => {
                  const qtyInCart = getItemQuantityInCart(item.id);
                  return (
                    <div
                      key={`rec-${item.id}`}
                      className="flex-shrink-0 w-[160px] bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 relative group"
                    >
                      <AddedFeedback show={addedItemId === item.id} />
                      <div
                        className="aspect-square bg-gray-100 relative overflow-hidden cursor-pointer"
                        onClick={() => openItemModal(item)}
                      >
                        <img src={getItemImage(item)} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        <div className="absolute top-2 left-2"><FoodBadge type="hit" /></div>
                      </div>
                      <div className="p-3">
                        <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">{item.name}</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
                        <div className="flex items-center justify-between mt-2.5">
                          <span className="text-sm font-extrabold text-gray-900">{formatPrice(item.price)}</span>
                          {qtyInCart > 0 ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => quickRemove(item.id)} className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors">
                                <Minus className="w-3 h-3 text-gray-600" />
                              </button>
                              <span className="w-4 text-center text-xs font-bold">{qtyInCart}</span>
                              <button onClick={() => quickAdd(item)} className="w-7 h-7 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center transition-colors active:scale-90">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => quickAdd(item)}
                              className="w-8 h-8 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center justify-center transition-all shadow-md shadow-orange-200/50 active:scale-90"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ═══ MENU GRID — 2 columns, square images, no weight ═══ */}
          <section>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
                <Utensils className="w-4 h-4 text-gray-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {activeCategory !== null
                  ? (localized(categories.find(c => c.id === activeCategory) || {}, 'name') || categories.find(c => c.id === activeCategory)?.name || 'Меню')
                  : searchQuery ? `${t('common.search')}: "${searchQuery}"` : t('food.allDishes')}
              </h2>
              <span className="text-sm text-gray-400 ml-auto">{filteredItems.length} блюд</span>
            </div>

            {filteredItems.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {filteredItems.map((item, index) => {
                  const hasGroups = itemHasGroups(item.id);
                  const qtyInCart = getItemQuantityInCart(item.id);
                  const badgeType = getBadgeType(item, index);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 group relative"
                    >
                      <AddedFeedback show={addedItemId === item.id} />
                      {/* Square image */}
                      <div
                        className="aspect-square bg-gray-100 relative overflow-hidden cursor-pointer"
                        onClick={() => openItemModal(item)}
                      >
                        <img src={getItemImage(item)} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute top-2 left-2 flex gap-1">
                          {badgeType && <FoodBadge type={badgeType} />}
                        </div>
                        {hasGroups && (
                          <span className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shadow-sm">
                            + опции
                          </span>
                        )}
                      </div>
                      {/* Card body — no weight */}
                      <div className="p-3">
                        <h3
                          className="font-bold text-gray-900 text-sm leading-tight line-clamp-1 cursor-pointer"
                          onClick={() => openItemModal(item)}
                        >
                          {item.name}
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed min-h-[28px]">{item.description}</p>
                        <div className="flex items-center justify-between mt-2.5">
                          <span className="text-base font-extrabold text-gray-900">{formatPrice(item.price)}</span>
                          {qtyInCart > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => quickRemove(item.id)} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-all active:scale-90">
                                <Minus className="w-3.5 h-3.5 text-gray-600" />
                              </button>
                              <span className="w-5 text-center font-bold text-sm">{qtyInCart}</span>
                              <button onClick={() => quickAdd(item)} className="w-8 h-8 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center justify-center transition-all shadow-md shadow-orange-200/50 active:scale-90">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => quickAdd(item)}
                              className="w-9 h-9 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center justify-center transition-all shadow-md shadow-orange-200/50 active:scale-90 hover:scale-105"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Utensils className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">{t('food.noDishes')}</p>
                <p className="text-gray-400 text-sm mt-1">Попробуйте выбрать другую категорию</p>
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
              className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-gray-900/30 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-11 h-11 bg-orange-500 rounded-xl flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-base block">{formatPrice(cartTotal)}</span>
                  <span className="text-white/50 text-xs">{cartCount} {cartCount === 1 ? 'товар' : cartCount < 5 ? 'товара' : 'товаров'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5 group-hover:bg-white/20 transition-colors">
                <span className="font-semibold text-sm">{t('food.cart')}</span>
                <ChevronRight className="w-4 h-4" />
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

                {/* Contact info */}
                <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                  <label className="text-sm font-bold text-gray-800 block">Контактные данные</label>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{t('food.yourName')} *</label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Введите имя" className="rounded-xl h-11 border-gray-200 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{t('food.phone')} *</label>
                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+7 (___) ___-__-__" className="rounded-xl h-11 border-gray-200 focus:border-orange-500" />
                  </div>

                  {/* Split address fields */}
                  {deliveryMethod === 'delivery' && (
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
                    {deliveryMethod === 'delivery' && (
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
                        {formatPrice(deliveryMethod === 'delivery' ? cartTotal + activeDeliveryPrice : cartTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-white rounded-b-3xl">
                <Button
                  onClick={submitOrder}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-base font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-200/50 active:scale-[0.98] transition-all"
                >
                  <MessageSquare className="w-5 h-5" />
                  {t('food.sendOrder')} {t('food.viaWhatsApp')}
                </Button>
                <p className="text-[11px] text-gray-400 text-center mt-2.5">
                  Заказ будет отправлен в WhatsApp для подтверждения
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}