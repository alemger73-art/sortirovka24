import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import ImageUpload from '@/components/ImageUpload';
import { Plus, Pencil, Trash2, Save, X, Package, FolderTree, ShoppingBag, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { resolveImageSrc } from '@/lib/storage';
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

type Section = 'products' | 'categories' | 'orders' | 'settings';

const ORDER_STATUS: Record<string, string> = {
  new: 'Новый',
  processing: 'В работе',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
};

export default function AdminGastronom() {
  const [section, setSection] = useState<Section>('products');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<GastronomCategory[]>([]);
  const [products, setProducts] = useState<GastronomProduct[]>([]);
  const [orders, setOrders] = useState<GastronomOrder[]>([]);
  const [settings, setSettings] = useState<GastronomSettings>({} as GastronomSettings);
  const [editingCat, setEditingCat] = useState<Partial<GastronomCategory> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<GastronomProduct> | null>(null);

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
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
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки данных ГАСТРОНОМ');
    } finally {
      setLoading(false);
    }
  }

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  );

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
      setEditingCat(null);
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
    } catch {
      toast.error('Ошибка удаления');
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
      setEditingProduct(null);
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
      const saved = await saveGastronomSettings(settings as Record<string, string>);
      setSettings(saved);
      toast.success('Настройки сохранены');
    } catch {
      toast.error('Ошибка сохранения настроек');
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
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Загрузка ГАСТРОНОМ...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
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

      <div className="flex gap-2 flex-wrap">
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
          </button>
        ))}
      </div>

      {/* Products */}
      {section === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{products.length} товаров</p>
            <Button size="sm" onClick={() => setEditingProduct({ is_active: true, is_popular: false, sort_order: products.length + 1 })}>
              <Plus className="h-4 w-4 mr-1" /> Добавить товар
            </Button>
          </div>

          {editingProduct && (
            <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">{editingProduct.id ? 'Редактировать товар' : 'Новый товар'}</h3>
                <button onClick={() => setEditingProduct(null)}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input placeholder="Название" value={editingProduct.name || ''} onChange={(e) => setEditingProduct(p => ({ ...p, name: e.target.value }))} />
                <Input type="number" placeholder="Цена (₸)" value={editingProduct.price ?? ''} onChange={(e) => setEditingProduct(p => ({ ...p, price: Number(e.target.value) }))} />
                <Input placeholder="Вес/объём (1 кг, 1 л...)" value={editingProduct.weight || ''} onChange={(e) => setEditingProduct(p => ({ ...p, weight: e.target.value }))} />
                <select
                  className="border rounded-md px-3 py-2 text-sm"
                  value={editingProduct.category_id ?? ''}
                  onChange={(e) => setEditingProduct(p => ({ ...p, category_id: Number(e.target.value) }))}
                >
                  <option value="">Категория</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Input type="number" placeholder="Порядок сортировки" value={editingProduct.sort_order ?? ''} onChange={(e) => setEditingProduct(p => ({ ...p, sort_order: Number(e.target.value) }))} />
                <div className="flex gap-4 items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editingProduct.is_popular} onChange={(e) => setEditingProduct(p => ({ ...p, is_popular: e.target.checked }))} />
                    Популярный
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editingProduct.is_active !== false} onChange={(e) => setEditingProduct(p => ({ ...p, is_active: e.target.checked }))} />
                    Активен
                  </label>
                </div>
              </div>
              <Textarea placeholder="Описание" value={editingProduct.description || ''} onChange={(e) => setEditingProduct(p => ({ ...p, description: e.target.value }))} rows={2} />
              <div>
                <p className="text-sm font-medium mb-1">Фото товара</p>
                <ImageUpload
                  value={editingProduct.image_url || ''}
                  onChange={(url) => setEditingProduct(p => ({ ...p, image_url: url }))}
                />
              </div>
              <Button onClick={handleSaveProduct} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="h-4 w-4 mr-1" /> Сохранить
              </Button>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedProducts.map(p => (
              <div key={p.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <div className="aspect-video bg-gray-50 relative">
                  {p.image_url && <img src={resolveImageSrc(p.image_url) || p.image_url} alt="" className="w-full h-full object-cover" />}
                  {p.is_popular && <Badge className="absolute top-2 left-2 bg-amber-500">Популярный</Badge>}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.weight} · {Math.round(p.price).toLocaleString('ru-RU')} ₸</p>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingProduct(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeleteProduct(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <Button size="sm" onClick={() => setEditingCat({ is_active: true, sort_order: categories.length + 1 })}>
              <Plus className="h-4 w-4 mr-1" /> Добавить категорию
            </Button>
          </div>
          {editingCat && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <Input placeholder="Название категории" value={editingCat.name || ''} onChange={(e) => setEditingCat(c => ({ ...c, name: e.target.value }))} />
              <Input type="number" placeholder="Порядок" value={editingCat.sort_order ?? ''} onChange={(e) => setEditingCat(c => ({ ...c, sort_order: Number(e.target.value) }))} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editingCat.is_alcohol} onChange={(e) => setEditingCat(c => ({ ...c, is_alcohol: e.target.checked }))} />
                Алкогольная категория (21+)
              </label>
              <ImageUpload value={editingCat.image_url || ''} onChange={(url) => setEditingCat(c => ({ ...c, image_url: url }))} />
              <div className="flex gap-2">
                <Button onClick={handleSaveCategory} className="bg-emerald-600 hover:bg-emerald-700"><Save className="h-4 w-4 mr-1" /> Сохранить</Button>
                <Button variant="outline" onClick={() => setEditingCat(null)}>Отмена</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-white border rounded-xl p-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  {c.image_url && <img src={resolveImageSrc(c.image_url) || c.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-gray-400">#{c.sort_order}{c.is_alcohol ? ' · 21+' : ''}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditingCat(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeleteCategory(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders */}
      {section === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-gray-400 text-sm">Заказов пока нет</p>}
          {orders.map(o => {
            let items: { name: string; qty: number; sum: number }[] = [];
            try { items = JSON.parse(o.order_items || '[]'); } catch { /* ignore */ }
            return (
              <div key={o.id} className="bg-white border rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold">Заказ #{o.id}</p>
                    <p className="text-sm text-gray-600">{o.customer_name} · {o.customer_phone}</p>
                    <p className="text-xs text-gray-400">{o.customer_address}</p>
                  </div>
                  <Badge variant={o.status === 'new' ? 'default' : 'secondary'}>
                    {ORDER_STATUS[o.status || 'new'] || o.status}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">
                  Оплата: {PAYMENT_LABELS[o.payment_method] || o.payment_method}
                </p>
                <div className="text-sm space-y-0.5">
                  {items.map((it, i) => (
                    <div key={i} className="flex justify-between text-gray-600">
                      <span>{it.name} ×{it.qty}</span>
                      <span>{it.sum} ₸</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="font-bold text-emerald-700">{Math.round(o.total_amount).toLocaleString('ru-RU')} ₸</span>
                  <div className="flex gap-1">
                    {(['new', 'processing', 'delivered', 'cancelled'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleOrderStatus(o.id, s)}
                        className={`text-xs px-2 py-1 rounded ${o.status === s ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                        {ORDER_STATUS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-400">{o.created_at}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Settings */}
      {section === 'settings' && (
        <div className="bg-white border rounded-xl p-4 space-y-4 max-w-lg">
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
            ['delivery_time', 'Время доставки'],
            ['min_order', 'Минимальный заказ (₸)'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
              <Input
                value={settings[key] || ''}
                onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.value }))}
              />
            </div>
          ))}
          <Button onClick={handleSaveSettings} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="h-4 w-4 mr-1" /> Сохранить настройки
          </Button>
          <p className="text-xs text-gray-400">
            Заказы отправляются в Telegram. Настройте TELEGRAM_BOT_TOKEN_GASTRONOM и TELEGRAM_CHAT_ID_GASTRONOM
            (или общие TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
          </p>
        </div>
      )}
    </div>
  );
}
