import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ImageUpload from '@/components/ImageUpload';
import { Plus, Pencil, Trash2, Save, X, Package, FolderTree, ShoppingBag, Settings, RefreshCw, Map, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { resolveImageSrc } from '@/lib/storage';
import DeliveryZoneEditor from '@/components/gastronom/DeliveryZoneEditor';
import LoyaltyGiftsEditor from '@/components/gastronom/LoyaltyGiftsEditor';
import {
  parseDeliveryZones,
  serializeDeliveryZones,
  type DeliveryZone,
  DEFAULT_STORE,
} from '@/lib/gastronomDelivery';
import {
  fetchGastronomCategories,
  fetchGastronomProducts,
  fetchGastronomOrders,
  fetchGastronomSettings,
  saveGastronomCategory,
  deleteGastronomCategory,
  saveGastronomProduct,
  deleteGastronomProduct,
  saveGastronomSettings,
  updateGastronomOrderStatus,
  type GastronomCategory,
  type GastronomProduct,
  type GastronomOrder,
  type GastronomSettings,
} from '@/lib/gastronomApi';
import {
  isLoyaltyEnabled,
  parseLoyaltyGifts,
  serializeLoyaltyGifts,
  type LoyaltyGift,
} from '@/lib/gastronomLoyalty';
import AdminPartnerAccess from '@/components/partner/AdminPartnerAccess';

interface AdminGastronomProps {
  partnerMode?: boolean;
}

type Section = 'products' | 'categories' | 'orders' | 'delivery' | 'gifts' | 'settings';

const ORDER_STATUS: Record<string, string> = {
  new: 'Новый',
  processing: 'В работе',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

const ORDER_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'processing', label: 'В работе' },
  { id: 'delivered', label: 'Доставлены' },
  { id: 'cancelled', label: 'Отменены' },
] as const;

function formatOrderDate(raw: string) {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return raw;
  }
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
};

const MOBILE_DIALOG =
  'max-h-[90vh] overflow-y-auto max-sm:fixed max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:p-4';

export default function AdminGastronom({ partnerMode = false }: AdminGastronomProps) {
  const [section, setSection] = useState<Section>('products');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<GastronomCategory[]>([]);
  const [products, setProducts] = useState<GastronomProduct[]>([]);
  const [orders, setOrders] = useState<GastronomOrder[]>([]);
  const [settings, setSettings] = useState<GastronomSettings>({} as GastronomSettings);
  const [editingCat, setEditingCat] = useState<Partial<GastronomCategory> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<GastronomProduct> | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState<string>('all');
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [storeLat, setStoreLat] = useState(DEFAULT_STORE[0]);
  const [storeLng, setStoreLng] = useState(DEFAULT_STORE[1]);
  const [loyaltyGifts, setLoyaltyGifts] = useState<LoyaltyGift[]>([]);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);

  async function loadAll(fullScreenLoader = false) {
    if (fullScreenLoader) setLoading(true);
    try {
      const [cats, prods, ords, sets] = await Promise.all([
        fetchGastronomCategories(),
        fetchGastronomProducts(),
        fetchGastronomOrders(),
        fetchGastronomSettings(),
      ]);
      setCategories(cats);
      setProducts(prods);
      setOrders(ords);
      setSettings(sets);
      setDeliveryZones(parseDeliveryZones(sets.delivery_zones));
      setStoreLat(Number(sets.store_lat) || DEFAULT_STORE[0]);
      setStoreLng(Number(sets.store_lng) || DEFAULT_STORE[1]);
      setLoyaltyGifts(parseLoyaltyGifts(sets.loyalty_gifts));
      setLoyaltyEnabled(isLoyaltyEnabled(sets));
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки данных ГАСТРОНОМ');
    } finally {
      if (fullScreenLoader) setLoading(false);
    }
  }

  function openCreateProduct() {
    setEditingProduct({ is_active: true, is_popular: false, sort_order: products.length + 1 });
    setProductDialogOpen(true);
  }

  function openEditProduct(product: GastronomProduct) {
    setEditingProduct({ ...product });
    setProductDialogOpen(true);
  }

  function closeProductDialog() {
    setProductDialogOpen(false);
    setEditingProduct(null);
  }

  function openCreateCategory() {
    setEditingCat({ is_active: true, sort_order: categories.length + 1 });
    setCategoryDialogOpen(true);
  }

  function openEditCategory(category: GastronomCategory) {
    setEditingCat({ ...category });
    setCategoryDialogOpen(true);
  }

  function closeCategoryDialog() {
    setCategoryDialogOpen(false);
    setEditingCat(null);
  }

  useEffect(() => { void loadAll(true); }, []);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  );

  const filteredOrders = useMemo(
    () => (orderFilter === 'all' ? orders : orders.filter((o) => o.status === orderFilter)),
    [orders, orderFilter]
  );

  const newOrdersCount = useMemo(() => orders.filter((o) => o.status === 'new').length, [orders]);

  async function handleSaveCategory() {
    if (!editingCat?.name?.trim()) return toast.error('Введите название категории');
    try {
      await saveGastronomCategory({
        ...editingCat,
        name: editingCat.name.trim(),
        is_active: editingCat.is_active !== false,
        is_alcohol: !!editingCat.is_alcohol,
        sort_order: Number(editingCat.sort_order || categories.length + 1),
      } as GastronomCategory & { name: string });
      toast.success('Категория сохранена');
      closeCategoryDialog();
      await loadAll();
    } catch {
      toast.error('Ошибка сохранения');
    }
  }

  async function handleDeleteCategory(id: number) {
    if (!confirm('Удалить категорию?')) return;
    try {
      await deleteGastronomCategory(id);
      toast.success('Удалено');
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  }

  async function handleSaveProduct() {
    if (!editingProduct?.name?.trim() || editingProduct.price == null) {
      return toast.error('Заполните название и цену');
    }
    try {
      await saveGastronomProduct({
        ...editingProduct,
        name: editingProduct.name.trim(),
        price: Number(editingProduct.price),
        category_id: Number(editingProduct.category_id || categories[0]?.id || 0) || undefined,
        is_active: editingProduct.is_active !== false,
        is_popular: !!editingProduct.is_popular,
        sort_order: Number(editingProduct.sort_order || products.length + 1),
      } as GastronomProduct & { name: string; price: number });
      toast.success('Товар сохранён');
      closeProductDialog();
      await loadAll();
    } catch {
      toast.error('Ошибка сохранения');
    }
  }

  async function handleDeleteProduct(id: number) {
    if (!confirm('Удалить товар?')) return;
    try {
      await deleteGastronomProduct(id);
      toast.success('Удалено');
      await loadAll();
    } catch {
      toast.error('Ошибка удаления');
    }
  }

  async function handleSaveSettings() {
    try {
      const payload = {
        ...settings,
        store_lat: String(storeLat),
        store_lng: String(storeLng),
        delivery_zones: serializeDeliveryZones(deliveryZones),
      } as Record<string, string>;
      const saved = await saveGastronomSettings(payload);
      setSettings(saved);
      toast.success('Настройки сохранены');
    } catch {
      toast.error('Ошибка сохранения настроек');
    }
  }

  async function handleSaveDeliveryZones() {
    try {
      const payload = {
        ...settings,
        store_lat: String(storeLat),
        store_lng: String(storeLng),
        delivery_zones: serializeDeliveryZones(deliveryZones),
      } as Record<string, string>;
      const saved = await saveGastronomSettings(payload);
      setSettings(saved);
      toast.success('Зоны доставки сохранены');
    } catch {
      toast.error('Ошибка сохранения зон');
    }
  }

  async function handleSaveLoyaltyGifts() {
    const invalid = loyaltyGifts.find((g) => !g.title.trim() || g.min_amount <= 0);
    if (invalid) {
      toast.error('У каждого подарка должны быть сумма и название');
      return;
    }
    try {
      const payload = {
        ...settings,
        loyalty_enabled: loyaltyEnabled ? '1' : '0',
        loyalty_gifts: serializeLoyaltyGifts(loyaltyGifts),
      } as Record<string, string>;
      const saved = await saveGastronomSettings(payload);
      setSettings(saved);
      setLoyaltyGifts(parseLoyaltyGifts(saved.loyalty_gifts));
      setLoyaltyEnabled(isLoyaltyEnabled(saved));
      toast.success('Подарки сохранены');
    } catch {
      toast.error('Ошибка сохранения подарков');
    }
  }

  async function handleOrderStatus(orderId: number, status: string) {
    try {
      await updateGastronomOrderStatus(orderId, status);
      toast.success('Статус обновлён');
      await loadAll();
    } catch {
      toast.error('Ошибка обновления статуса');
    }
  }

  const tabs: { id: Section; label: string; icon: typeof Package }[] = [
    { id: 'products', label: 'Товары', icon: Package },
    { id: 'categories', label: 'Категории', icon: FolderTree },
    { id: 'orders', label: 'Заказы', icon: ShoppingBag },
    { id: 'delivery', label: 'Зоны доставки', icon: Map },
    { id: 'gifts', label: 'Подарки', icon: Gift },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Загрузка ГАСТРОНОМ...</div>;
  }

  return (
    <>
    <div className="space-y-4 md:space-y-6">
      <div className="hidden md:flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ГАСТРОНОМ</h1>
          <p className="text-sm text-gray-500">Партнёр · доставка продуктов питания</p>
        </div>
        <a
          href="/gastronom"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-600 hover:underline"
        >
          Открыть витрину →
        </a>
      </div>

      <div className="md:hidden flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500 truncate">Доставка продуктов</p>
        <a
          href="/gastronom"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-emerald-600 font-medium shrink-0 py-2 px-3 rounded-lg bg-emerald-50"
        >
          Витрина
        </a>
      </div>

      {/* Desktop tabs */}
      <div className="hidden md:flex gap-2 flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === id ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === 'orders' && newOrdersCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {newOrdersCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Products */}
      {section === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-2">
            <p className="text-sm text-gray-500">{products.length} товаров</p>
            <Button type="button" size="sm" onClick={openCreateProduct} className="h-10 md:h-9">
              <Plus className="h-4 w-4 mr-1" /> Добавить товар
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {sortedProducts.map(p => (
              <div key={p.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <div className="aspect-[4/3] sm:aspect-video bg-gray-50 relative">
                  {p.image_url && <img src={resolveImageSrc(p.image_url) || p.image_url} alt="" className="w-full h-full object-cover" />}
                  {p.is_popular && <Badge className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-amber-500 text-[10px] sm:text-xs">Популярный</Badge>}
                  {p.is_active === false && <Badge className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-gray-500 text-[10px] sm:text-xs">Скрыт</Badge>}
                </div>
                <div className="p-2 sm:p-3">
                  <p className="font-semibold text-xs sm:text-sm line-clamp-2">{p.name}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{p.weight} · {Math.round(p.price).toLocaleString('ru-RU')} ₸</p>
                  <div className="flex gap-1.5 mt-2">
                    <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0 sm:h-8 sm:w-auto sm:px-3" onClick={() => openEditProduct(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0 text-red-600 sm:h-8 sm:w-auto sm:px-3" onClick={() => handleDeleteProduct(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {section === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={openCreateCategory} className="h-10 md:h-9">
              <Plus className="h-4 w-4 mr-1" /> Добавить категорию
            </Button>
          </div>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 sm:gap-3 bg-white border rounded-xl p-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  {c.image_url && <img src={resolveImageSrc(c.image_url) || c.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    #{c.sort_order}{c.is_alcohol ? ' · 21+' : ''}{c.is_active === false ? ' · скрыта' : ''}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0 shrink-0" onClick={() => openEditCategory(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0 text-red-600 shrink-0" onClick={() => handleDeleteCategory(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders */}
      {section === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {ORDER_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOrderFilter(f.id)}
                  className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                    orderFilter === f.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                  {f.id === 'new' && newOrdersCount > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-white/20 text-xs">
                      {newOrdersCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadAll()} className="h-10 shrink-0 w-full sm:w-auto">
              <RefreshCw className="h-4 w-4 mr-1" /> Обновить
            </Button>
          </div>

          {filteredOrders.length === 0 && <p className="text-gray-400 text-sm">Заказов пока нет</p>}
          {filteredOrders.map(o => {
            let items: { name: string; qty: number; sum: number; is_gift?: boolean }[] = [];
            try { items = JSON.parse(o.order_items || '[]'); } catch { /* ignore */ }
            const giftItems = items.filter((it) => it.is_gift);
            const productItems = items.filter((it) => !it.is_gift);
            return (
              <div key={o.id} className="bg-white border rounded-xl p-3 sm:p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">Заказ #{o.id}</p>
                    <p className="text-sm text-gray-600">{o.customer_name}</p>
                    <a href={`tel:${o.customer_phone}`} className="text-sm text-emerald-600 font-medium block py-0.5">
                      {o.customer_phone}
                    </a>
                    <p className="text-xs text-gray-400 break-words">{o.customer_address}</p>
                  </div>
                  <Badge variant={o.status === 'new' ? 'default' : 'secondary'} className="shrink-0">
                    {ORDER_STATUS[o.status || 'new'] || o.status}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">
                  Оплата: {PAYMENT_LABELS[o.payment_method] || o.payment_method}
                </p>
                {o.comment && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 break-words">
                    <span className="font-medium">Комментарий:</span> {o.comment}
                  </p>
                )}
                <div className="text-sm space-y-0.5">
                  {productItems.map((it, i) => (
                    <div key={i} className="flex justify-between gap-2 text-gray-600">
                      <span className="min-w-0 truncate">{it.name} ×{it.qty}</span>
                      <span className="shrink-0">{it.sum} ₸</span>
                    </div>
                  ))}
                  {giftItems.map((it, i) => (
                    <div key={`gift-${i}`} className="flex justify-between gap-2 text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
                      <span className="min-w-0 truncate font-medium">{it.name}</span>
                      <span className="shrink-0 text-xs">бесплатно</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-emerald-700">{Math.round(o.total_amount).toLocaleString('ru-RU')} ₸</span>
                    <p className="text-xs text-gray-400">{formatOrderDate(o.created_at)}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                    {(['new', 'processing', 'delivered', 'cancelled'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleOrderStatus(o.id, s)}
                        className={`text-xs px-3 py-2.5 rounded-lg min-h-[40px] ${
                          o.status === s ? 'bg-emerald-100 text-emerald-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {ORDER_STATUS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {section === 'delivery' && (
        <div className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-gray-900">Зоны доставки на карте</h3>
              <p className="text-sm text-gray-500 hidden sm:block">Нарисуйте полигоны — цена доставки определится автоматически по адресу клиента</p>
              <p className="text-xs text-gray-500 sm:hidden">Клик — точка границы, двойной клик — магазин</p>
            </div>
            <Button type="button" onClick={() => void handleSaveDeliveryZones()} className="hidden sm:inline-flex bg-emerald-600 hover:bg-emerald-700 h-10">
              <Save className="h-4 w-4 mr-1" /> Сохранить зоны
            </Button>
          </div>
          <DeliveryZoneEditor
            zones={deliveryZones}
            storeLat={storeLat}
            storeLng={storeLng}
            onZonesChange={setDeliveryZones}
            onStoreChange={(lat, lng) => { setStoreLat(lat); setStoreLng(lng); }}
          />
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Сообщение вне зоны доставки</label>
            <Textarea
              value={settings.outside_zone_message || ''}
              onChange={(e) => setSettings((s) => ({ ...s, outside_zone_message: e.target.value }))}
              rows={2}
              placeholder="Доставка по этому адресу недоступна..."
            />
          </div>
          <p className="text-xs text-gray-400 pb-16 sm:pb-0">
            Если зоны не настроены, используется фиксированная стоимость из вкладки «Настройки» (delivery_fee).
          </p>
          <div className="sm:hidden fixed bottom-[4.5rem] left-0 right-0 z-10 px-3 safe-area-pb">
            <Button type="button" onClick={() => void handleSaveDeliveryZones()} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 shadow-lg">
              <Save className="h-4 w-4 mr-2" /> Сохранить зоны
            </Button>
          </div>
        </div>
      )}

      {section === 'gifts' && (
        <div className="space-y-4 pb-20 sm:pb-0">
          <LoyaltyGiftsEditor
            gifts={loyaltyGifts}
            onChange={setLoyaltyGifts}
            enabled={loyaltyEnabled}
            onEnabledChange={setLoyaltyEnabled}
          />
          <div className="sm:hidden fixed bottom-[4.5rem] left-0 right-0 z-10 px-3 safe-area-pb">
            <Button type="button" onClick={() => void handleSaveLoyaltyGifts()} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 shadow-lg">
              <Save className="h-4 w-4 mr-2" /> Сохранить подарки
            </Button>
          </div>
          <Button type="button" onClick={() => void handleSaveLoyaltyGifts()} className="hidden sm:inline-flex bg-emerald-600 hover:bg-emerald-700 h-11">
            <Save className="h-4 w-4 mr-2" /> Сохранить подарки
          </Button>
        </div>
      )}

      {/* Settings */}
      {section === 'settings' && (
        <div className="space-y-6">
        <div className="bg-white border rounded-xl p-3 sm:p-4 space-y-4 max-w-lg">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Логотип магазина</label>
            <ImageUpload
              value={settings.logo_url || ''}
              onChange={(url) => setSettings(s => ({ ...s, logo_url: url }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Фото главного баннера</label>
            <ImageUpload
              value={settings.hero_image_url || ''}
              onChange={(url) => setSettings(s => ({ ...s, hero_image_url: url }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Фото баннера алкоголя (21+)</label>
            <ImageUpload
              value={settings.alcohol_banner_image || ''}
              onChange={(url) => setSettings(s => ({ ...s, alcohol_banner_image: url }))}
            />
          </div>
          {[
            ['store_name', 'Название магазина'],
            ['store_tagline', 'Подзаголовок'],
            ['hero_title', 'Заголовок баннера'],
            ['default_address', 'Адрес по умолчанию'],
            ['delivery_city', 'Город доставки (для поиска адреса)'],
            ['delivery_area', 'Район доставки (для подсказок клиенту)'],
            ['delivery_time', 'Время доставки'],
            ['min_order', 'Минимальный заказ (₸)'],
            ['delivery_fee', 'Стоимость доставки (₸, если зоны не настроены)'],
            ['store_phone', 'Телефон магазина'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
              <Input
                value={settings[key] || ''}
                onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.value }))}
              />
            </div>
          ))}
          <Button onClick={handleSaveSettings} className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700">
            <Save className="h-4 w-4 mr-1" /> Сохранить настройки
          </Button>
          <p className="text-xs text-gray-400">
            Заказы отправляются в Telegram. Настройте TELEGRAM_BOT_TOKEN_GASTRONOM и TELEGRAM_CHAT_ID_GASTRONOM
            (или общие TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
          </p>
        </div>
        {!partnerMode && <AdminPartnerAccess partnerType="gastronom" />}
        </div>
      )}
    </div>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-6">
          {tabs.map(({ id, label, icon: Icon }) => {
            const shortLabel =
              id === 'delivery' ? 'Зоны'
              : id === 'gifts' ? 'Подарки'
              : id === 'categories' ? 'Кат.'
              : label;
            const isActive = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[56px] transition-colors ${
                  isActive ? 'text-emerald-700' : 'text-gray-500 active:bg-gray-50'
                }`}
              >
                <span className="relative">
                  <Icon className={`h-5 w-5 ${isActive ? 'text-emerald-600' : ''}`} />
                  {id === 'orders' && newOrdersCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {newOrdersCount > 9 ? '9+' : newOrdersCount}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] leading-tight text-center ${isActive ? 'font-semibold' : ''}`}>
                  {shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <Dialog
        open={productDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeProductDialog();
          else setProductDialogOpen(true);
        }}
      >
        <DialogContent className={`max-w-2xl ${MOBILE_DIALOG}`}>
          <DialogHeader>
            <DialogTitle>{editingProduct?.id ? 'Редактировать товар' : 'Новый товар'}</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input placeholder="Название" value={editingProduct.name || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, name: e.target.value }) : p)} />
                <Input type="number" placeholder="Цена (₸)" value={editingProduct.price ?? ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, price: Number(e.target.value) }) : p)} />
                <Input placeholder="Вес/объём (1 кг, 1 л...)" value={editingProduct.weight || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, weight: e.target.value }) : p)} />
                <select
                  className="border rounded-md px-3 py-2 text-sm"
                  value={editingProduct.category_id ?? ''}
                  onChange={(e) => setEditingProduct(p => p ? ({ ...p, category_id: Number(e.target.value) }) : p)}
                >
                  <option value="">Категория</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Input type="number" placeholder="Порядок сортировки" value={editingProduct.sort_order ?? ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, sort_order: Number(e.target.value) }) : p)} />
                <div className="flex gap-4 items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editingProduct.is_popular} onChange={(e) => setEditingProduct(p => p ? ({ ...p, is_popular: e.target.checked }) : p)} />
                    Популярный
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editingProduct.is_active !== false} onChange={(e) => setEditingProduct(p => p ? ({ ...p, is_active: e.target.checked }) : p)} />
                    Активен
                  </label>
                </div>
              </div>
              <Textarea placeholder="Описание" value={editingProduct.description || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, description: e.target.value }) : p)} rows={3} />
              <div>
                <p className="text-sm font-medium mb-1">Фото товара</p>
                <ImageUpload
                  value={editingProduct.image_url || ''}
                  onChange={(url) => setEditingProduct(p => p ? ({ ...p, image_url: url }) : p)}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2 sticky bottom-0 bg-background pb-2 sm:static sm:pb-0">
                <Button type="button" onClick={() => void handleSaveProduct()} className="bg-emerald-600 hover:bg-emerald-700 h-11 sm:h-10 flex-1 sm:flex-none">
                  <Save className="h-4 w-4 mr-1" /> Сохранить
                </Button>
                <Button type="button" variant="outline" onClick={closeProductDialog} className="h-11 sm:h-10">Отмена</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCategoryDialog();
          else setCategoryDialogOpen(true);
        }}
      >
        <DialogContent className={`max-w-lg ${MOBILE_DIALOG}`}>
          <DialogHeader>
            <DialogTitle>{editingCat?.id ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
          </DialogHeader>
          {editingCat && (
            <div className="space-y-3">
              <Input placeholder="Название категории" value={editingCat.name || ''} onChange={(e) => setEditingCat(c => c ? ({ ...c, name: e.target.value }) : c)} />
              <Input type="number" placeholder="Порядок" value={editingCat.sort_order ?? ''} onChange={(e) => setEditingCat(c => c ? ({ ...c, sort_order: Number(e.target.value) }) : c)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editingCat.is_alcohol} onChange={(e) => setEditingCat(c => c ? ({ ...c, is_alcohol: e.target.checked }) : c)} />
                Алкогольная категория (21+)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editingCat.is_active !== false} onChange={(e) => setEditingCat(c => c ? ({ ...c, is_active: e.target.checked }) : c)} />
                Активна (видна в каталоге)
              </label>
              <ImageUpload value={editingCat.image_url || ''} onChange={(url) => setEditingCat(c => c ? ({ ...c, image_url: url }) : c)} />
              <div className="flex flex-col sm:flex-row gap-2 pt-2 sticky bottom-0 bg-background pb-2 sm:static sm:pb-0">
                <Button type="button" onClick={() => void handleSaveCategory()} className="bg-emerald-600 hover:bg-emerald-700 h-11 sm:h-10 flex-1 sm:flex-none">
                  <Save className="h-4 w-4 mr-1" /> Сохранить
                </Button>
                <Button type="button" variant="outline" onClick={closeCategoryDialog} className="h-11 sm:h-10">Отмена</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
