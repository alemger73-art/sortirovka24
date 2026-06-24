import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ImageUpload from '@/components/ImageUpload';
import { Plus, Pencil, Trash2, Save, Package, FolderTree, ShoppingBag, Settings, RefreshCw, Map, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { resolveImageSrc } from '@/lib/storage';
import DeliveryZoneEditor from '@/components/gastronom/DeliveryZoneEditor';
import LoyaltyGiftsEditor from '@/components/gastronom/LoyaltyGiftsEditor';
import { parseDeliveryZones, serializeDeliveryZones, type DeliveryZone, DEFAULT_STORE } from '@/lib/gastronomDelivery';
import {
  fetchVolnaCategories, fetchVolnaProducts, fetchVolnaOrders, fetchVolnaSettings,
  saveVolnaCategory, deleteVolnaCategory, saveVolnaProduct, deleteVolnaProduct,
  saveVolnaSettings, updateVolnaOrderStatus,
  type VolnaCategory, type VolnaProduct, type VolnaOrder, type VolnaSettings,
} from '@/lib/volnaApi';
import { isLoyaltyEnabled, parseLoyaltyGifts, serializeLoyaltyGifts, type LoyaltyGift } from '@/lib/gastronomLoyalty';

type Section = 'products' | 'categories' | 'orders' | 'delivery' | 'gifts' | 'settings';

const ORDER_STATUS: Record<string, string> = { new: 'Новый', processing: 'В работе', delivered: 'Доставлен', cancelled: 'Отменён' };
const ORDER_FILTERS = [{ id: 'all', label: 'Все' }, { id: 'new', label: 'Новые' }, { id: 'processing', label: 'В работе' }, { id: 'delivered', label: 'Доставлены' }, { id: 'cancelled', label: 'Отменены' }] as const;

function formatOrderDate(raw: string) {
  if (!raw) return '—';
  try { return new Date(raw).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return raw; }
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'Наличные', kaspi_qr: 'Kaspi QR', halyk_qr: 'Halyk QR' };
const MOBILE_DIALOG = 'max-h-[90vh] overflow-y-auto max-sm:fixed max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:p-4';

export default function AdminVolna() {
  const [section, setSection] = useState<Section>('products');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<VolnaCategory[]>([]);
  const [products, setProducts] = useState<VolnaProduct[]>([]);
  const [orders, setOrders] = useState<VolnaOrder[]>([]);
  const [settings, setSettings] = useState<VolnaSettings>({} as VolnaSettings);
  const [editingCat, setEditingCat] = useState<Partial<VolnaCategory> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<VolnaProduct> | null>(null);
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
        fetchVolnaCategories(), fetchVolnaProducts(), fetchVolnaOrders(), fetchVolnaSettings(),
      ]);
      setCategories(cats); setProducts(prods); setOrders(ords); setSettings(sets);
      setDeliveryZones(parseDeliveryZones(sets.delivery_zones));
      setStoreLat(Number(sets.store_lat) || DEFAULT_STORE[0]);
      setStoreLng(Number(sets.store_lng) || DEFAULT_STORE[1]);
      setLoyaltyGifts(parseLoyaltyGifts(sets.loyalty_gifts));
      setLoyaltyEnabled(isLoyaltyEnabled(sets));
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки данных VOLNA');
    } finally {
      if (fullScreenLoader) setLoading(false);
    }
  }

  useEffect(() => { void loadAll(true); }, []);

  const sortedProducts = useMemo(() => [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [products]);
  const filteredOrders = useMemo(() => (orderFilter === 'all' ? orders : orders.filter((o) => o.status === orderFilter)), [orders, orderFilter]);
  const newOrdersCount = useMemo(() => orders.filter((o) => o.status === 'new').length, [orders]);

  async function handleSaveCategory() {
    if (!editingCat?.name?.trim()) return toast.error('Введите название категории');
    try {
      await saveVolnaCategory({ ...editingCat, name: editingCat.name.trim(), is_active: editingCat.is_active !== false, sort_order: Number(editingCat.sort_order || categories.length + 1) } as VolnaCategory & { name: string });
      toast.success('Категория сохранена'); setCategoryDialogOpen(false); setEditingCat(null); await loadAll();
    } catch { toast.error('Ошибка сохранения'); }
  }

  async function handleSaveProduct() {
    if (!editingProduct?.name?.trim() || editingProduct.price == null) return toast.error('Заполните название и цену');
    try {
      await saveVolnaProduct({ ...editingProduct, name: editingProduct.name.trim(), price: Number(editingProduct.price), category_id: Number(editingProduct.category_id || categories[0]?.id || 0) || undefined, is_active: editingProduct.is_active !== false, is_popular: !!editingProduct.is_popular, sort_order: Number(editingProduct.sort_order || products.length + 1) } as VolnaProduct & { name: string; price: number });
      toast.success('Товар сохранён'); setProductDialogOpen(false); setEditingProduct(null); await loadAll();
    } catch { toast.error('Ошибка сохранения'); }
  }

  async function handleSaveSettings() {
    try {
      const saved = await saveVolnaSettings({ ...settings, store_lat: String(storeLat), store_lng: String(storeLng), delivery_zones: serializeDeliveryZones(deliveryZones) } as Record<string, string>);
      setSettings(saved); toast.success('Настройки VOLNA сохранены');
    } catch { toast.error('Ошибка сохранения настроек'); }
  }

  async function handleOrderStatus(orderId: number, status: string) {
    try { await updateVolnaOrderStatus(orderId, status); toast.success('Статус обновлён'); await loadAll(); } catch { toast.error('Ошибка'); }
  }

  const tabs = [
    { id: 'products' as Section, label: 'Товары', icon: Package },
    { id: 'categories' as Section, label: 'Категории', icon: FolderTree },
    { id: 'orders' as Section, label: 'Заказы', icon: ShoppingBag },
    { id: 'delivery' as Section, label: 'Зоны', icon: Map },
    { id: 'gifts' as Section, label: 'Подарки', icon: Gift },
    { id: 'settings' as Section, label: 'Настройки', icon: Settings },
  ];

  if (loading) return <div className="p-8 text-center text-gray-400">Загрузка VOLNA...</div>;

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">VOLNA</h1>
          <p className="text-sm text-gray-500">Партнёр · алкогольные напитки · 21+</p>
        </div>
        <a href="/volna" target="_blank" rel="noopener noreferrer" className="text-sm text-violet-600 hover:underline">Открыть витрину →</a>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setSection(id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${section === id ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-gray-50 text-gray-600'}`}>
            <Icon className="h-4 w-4" />{label}
            {id === 'orders' && newOrdersCount > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5">{newOrdersCount}</span>}
          </button>
        ))}
      </div>

      {section === 'products' && (
        <div className="space-y-4">
          <Button size="sm" onClick={() => { setEditingProduct({ is_active: true, is_popular: false, sort_order: products.length + 1 }); setProductDialogOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Добавить товар</Button>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedProducts.map(p => (
              <div key={p.id} className="bg-white border rounded-xl overflow-hidden">
                <div className="aspect-video bg-gray-50 relative">
                  {p.image_url && <img src={resolveImageSrc(p.image_url) || p.image_url} alt="" className="w-full h-full object-cover" />}
                  {p.is_popular && <Badge className="absolute top-2 left-2 bg-amber-500">Хит</Badge>}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm line-clamp-2">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.weight} · {Math.round(p.price).toLocaleString('ru-RU')} ₸</p>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingProduct({ ...p }); setProductDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={async () => { if (confirm('Удалить?')) { await deleteVolnaProduct(p.id); await loadAll(); } }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'categories' && (
        <div className="space-y-2">
          <Button size="sm" onClick={() => { setEditingCat({ is_active: true, sort_order: categories.length + 1 }); setCategoryDialogOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Категория</Button>
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-white border rounded-xl p-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">{c.image_url && <img src={resolveImageSrc(c.image_url) || c.image_url} alt="" className="w-full h-full object-cover" />}</div>
              <div className="flex-1"><p className="font-medium text-sm">{c.name}</p><p className="text-xs text-gray-400">#{c.sort_order}</p></div>
              <Button size="sm" variant="outline" onClick={() => { setEditingCat({ ...c }); setCategoryDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" className="text-red-600" onClick={async () => { if (confirm('Удалить?')) { await deleteVolnaCategory(c.id); await loadAll(); } }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}

      {section === 'orders' && (
        <div className="space-y-3">
          {filteredOrders.map(o => (
            <div key={o.id} className="bg-white border rounded-xl p-4 space-y-2">
              <div className="flex justify-between"><p className="font-bold">#{o.id} · {o.customer_name}</p><Badge>{ORDER_STATUS[o.status || 'new']}</Badge></div>
              <p className="text-sm text-violet-600">{o.customer_phone}</p>
              <p className="text-xs text-gray-400">{o.customer_address}</p>
              <p className="font-bold text-violet-700">{Math.round(o.total_amount).toLocaleString('ru-RU')} ₸</p>
              <div className="flex flex-wrap gap-1">
                {(['new', 'processing', 'delivered', 'cancelled'] as const).map(s => (
                  <button key={s} onClick={() => handleOrderStatus(o.id, s)} className={`text-xs px-3 py-2 rounded-lg ${o.status === s ? 'bg-violet-100 text-violet-700' : 'bg-gray-100'}`}>{ORDER_STATUS[s]}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'delivery' && (
        <div className="space-y-4">
          <DeliveryZoneEditor zones={deliveryZones} storeLat={storeLat} storeLng={storeLng} onZonesChange={setDeliveryZones} onStoreChange={(lat, lng) => { setStoreLat(lat); setStoreLng(lng); }} />
          <Button onClick={() => void handleSaveSettings()} className="bg-violet-600 hover:bg-violet-700"><Save className="h-4 w-4 mr-1" /> Сохранить зоны</Button>
        </div>
      )}

      {section === 'gifts' && (
        <div className="space-y-4">
          <LoyaltyGiftsEditor gifts={loyaltyGifts} onChange={setLoyaltyGifts} enabled={loyaltyEnabled} onEnabledChange={setLoyaltyEnabled} />
          <Button onClick={async () => { await saveVolnaSettings({ ...settings, loyalty_enabled: loyaltyEnabled ? '1' : '0', loyalty_gifts: serializeLoyaltyGifts(loyaltyGifts) } as Record<string, string>); toast.success('Подарки сохранены'); }} className="bg-violet-600 hover:bg-violet-700">Сохранить подарки</Button>
        </div>
      )}

      {section === 'settings' && (
        <div className="bg-white border rounded-xl p-4 space-y-4 max-w-lg">
          <ImageUpload value={settings.logo_url || ''} onChange={(url) => setSettings(s => ({ ...s, logo_url: url }))} />
          <ImageUpload value={settings.hero_image_url || ''} onChange={(url) => setSettings(s => ({ ...s, hero_image_url: url }))} />
          <ImageUpload value={settings.promo_image_url || ''} onChange={(url) => setSettings(s => ({ ...s, promo_image_url: url }))} />
          {[['store_name', 'Название'], ['store_tagline', 'Подзаголовок'], ['hero_title', 'Заголовок баннера'], ['promo_title', 'Акция 1 — заголовок'], ['promo_subtitle', 'Акция 1 — текст'], ['promo2_title', 'Акция 2 — заголовок'], ['promo2_subtitle', 'Акция 2 — текст'], ['min_order', 'Мин. заказ ₸'], ['store_phone', 'Телефон']].map(([key, label]) => (
            <div key={key}><label className="text-sm font-medium">{label}</label><Input value={settings[key] || ''} onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.value }))} /></div>
          ))}
          <Button onClick={() => void handleSaveSettings()} className="bg-violet-600 hover:bg-violet-700 w-full"><Save className="h-4 w-4 mr-1" /> Сохранить</Button>
          <p className="text-xs text-gray-400">Telegram: TELEGRAM_BOT_TOKEN_VOLNA / TELEGRAM_CHAT_ID_VOLNA</p>
        </div>
      )}

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className={MOBILE_DIALOG}>
          <DialogHeader><DialogTitle>{editingProduct?.id ? 'Товар' : 'Новый товар'}</DialogTitle></DialogHeader>
          {editingProduct && (
            <div className="space-y-3">
              <Input placeholder="Название" value={editingProduct.name || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, name: e.target.value }) : p)} />
              <Input type="number" placeholder="Цена" value={editingProduct.price ?? ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, price: Number(e.target.value) }) : p)} />
              <Input placeholder="Объём (0,75 л)" value={editingProduct.weight || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, weight: e.target.value }) : p)} />
              <select className="border rounded-md px-3 py-2 w-full text-sm" value={editingProduct.category_id ?? ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, category_id: Number(e.target.value) }) : p)}>
                <option value="">Категория</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ImageUpload value={editingProduct.image_url || ''} onChange={(url) => setEditingProduct(p => p ? ({ ...p, image_url: url }) : p)} />
              <Button onClick={() => void handleSaveProduct()} className="bg-violet-600 w-full">Сохранить</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className={MOBILE_DIALOG}>
          <DialogHeader><DialogTitle>Категория</DialogTitle></DialogHeader>
          {editingCat && (
            <div className="space-y-3">
              <Input placeholder="Название" value={editingCat.name || ''} onChange={(e) => setEditingCat(c => c ? ({ ...c, name: e.target.value }) : c)} />
              <ImageUpload value={editingCat.image_url || ''} onChange={(url) => setEditingCat(c => c ? ({ ...c, image_url: url }) : c)} />
              <Button onClick={() => void handleSaveCategory()} className="bg-violet-600 w-full">Сохранить</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

