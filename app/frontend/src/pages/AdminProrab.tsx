import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ImageUpload from '@/components/ImageUpload';
import { Plus, Pencil, Trash2, Save, Package, FolderTree, ShoppingBag, Settings, RefreshCw, Map, HardHat } from 'lucide-react';
import { toast } from 'sonner';
import { resolveImageSrc } from '@/lib/storage';
import DeliveryZoneEditor from '@/components/gastronom/DeliveryZoneEditor';
import { parseDeliveryZones, serializeDeliveryZones, type DeliveryZone, DEFAULT_STORE } from '@/lib/gastronomDelivery';
import {
  fetchProrabCategories, fetchProrabProducts, fetchProrabOrders, fetchProrabSettings,
  saveProrabCategory, deleteProrabCategory, saveProrabProduct, deleteProrabProduct,
  saveProrabSettings, updateProrabOrderStatus,
  type ProrabCategory, type ProrabProduct, type ProrabOrder, type ProrabSettings,
} from '@/lib/prorabApi';
import AdminPartnerAccess from '@/components/partner/AdminPartnerAccess';

interface AdminProrabProps {
  partnerMode?: boolean;
}

type Section = 'products' | 'categories' | 'orders' | 'delivery' | 'settings';

function getORDER_STATUS(adminT: (key: string) => string) {
  const ORDER_STATUS: Record<string, string> = {
  new: adminT("admin.ui.0508"), processing: adminT("admin.ui.0128"), delivered: adminT("admin.ui.0513"), cancelled: adminT("admin.ui.0514"),
};
  return ORDER_STATUS;
}

function getORDER_FILTERS(adminT: (key: string) => string) {
  const ORDER_FILTERS = [
  { id: 'all', label: adminT("admin.ui.0132") }, { id: 'new', label: adminT("admin.ui.0223") }, { id: 'processing', label: adminT("admin.ui.0128") },
  { id: 'delivered', label: adminT("admin.ui.0715") }, { id: 'cancelled', label: adminT("admin.ui.0716") },
] as const;
  return ORDER_FILTERS;
}

const MOBILE_DIALOG = 'max-h-[90vh] overflow-y-auto max-sm:fixed max-sm:inset-0 max-sm:max-w-none max-sm:h-[100dvh] max-sm:rounded-none';
const ACCENT = 'bg-amber-600 hover:bg-amber-700 text-white';
const ACCENT_LIGHT = 'bg-amber-50 text-amber-700 border-amber-200';

function formatOrderDate(raw: string, locale: string) {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return raw; }
}

export default function AdminProrab({ partnerMode = false }: AdminProrabProps) {
  const { t: adminT, lang } = useLanguage();
  const adminLocale = lang === 'kz' ? 'kk-KZ' : 'ru-RU';
  const ORDER_STATUS = getORDER_STATUS(adminT);
  const ORDER_FILTERS = getORDER_FILTERS(adminT);

  const [section, setSection] = useState<Section>('products');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ProrabCategory[]>([]);
  const [products, setProducts] = useState<ProrabProduct[]>([]);
  const [orders, setOrders] = useState<ProrabOrder[]>([]);
  const [settings, setSettings] = useState<ProrabSettings>({} as ProrabSettings);
  const [editingCat, setEditingCat] = useState<Partial<ProrabCategory> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<ProrabProduct> | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState('all');
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [storeLat, setStoreLat] = useState(DEFAULT_STORE[0]);
  const [storeLng, setStoreLng] = useState(DEFAULT_STORE[1]);

  async function loadAll(fullScreenLoader = false) {
    if (fullScreenLoader) setLoading(true);
    try {
      const [cats, prods, ords, sets] = await Promise.all([
        fetchProrabCategories(), fetchProrabProducts(), fetchProrabOrders(), fetchProrabSettings(),
      ]);
      setCategories(cats);
      setProducts(prods);
      setOrders(ords);
      setSettings(sets);
      setDeliveryZones(parseDeliveryZones(sets.delivery_zones));
      setStoreLat(Number(sets.store_lat) || DEFAULT_STORE[0]);
      setStoreLng(Number(sets.store_lng) || DEFAULT_STORE[1]);
    } catch (e) {
      console.error(e);
      toast.error(adminT("admin.ui.1024"));
    } finally {
      if (fullScreenLoader) setLoading(false);
    }
  }

  useEffect(() => { void loadAll(true); }, []);

  const sortedProducts = useMemo(() => [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [products]);
  const filteredOrders = useMemo(() => (orderFilter === 'all' ? orders : orders.filter((o) => o.status === orderFilter)), [orders, orderFilter]);
  const newOrdersCount = useMemo(() => orders.filter((o) => o.status === 'new').length, [orders]);

  const tabs: { id: Section; label: string; icon: typeof Package }[] = [
    { id: 'products', label: adminT("admin.ui.0698"), icon: Package },
    { id: 'categories', label: adminT("admin.ui.0242"), icon: FolderTree },
    { id: 'orders', label: adminT("admin.ui.0239"), icon: ShoppingBag },
    { id: 'delivery', label: adminT("admin.ui.0762"), icon: Map },
    { id: 'settings', label: adminT("admin.ui.0245"), icon: Settings },
  ];

  async function handleSaveCategory() {
    if (!editingCat?.name?.trim()) return toast.error(adminT("admin.ui.1025"));
    try {
      await saveProrabCategory({
        ...editingCat, name: editingCat.name.trim(), is_active: editingCat.is_active !== false,
        sort_order: Number(editingCat.sort_order || categories.length + 1),
      } as ProrabCategory & { name: string });
      toast.success(adminT("admin.ui.0482"));
      setCategoryDialogOpen(false); setEditingCat(null);
      await loadAll();
    } catch { toast.error(adminT("admin.ui.0055")); }
  }

  async function handleSaveProduct() {
    if (!editingProduct?.name?.trim() || editingProduct.price == null) return toast.error(adminT("admin.ui.0719"));
    try {
      await saveProrabProduct({
        ...editingProduct, name: editingProduct.name.trim(), price: Number(editingProduct.price),
        category_id: Number(editingProduct.category_id || categories[0]?.id || 0) || undefined,
        is_active: editingProduct.is_active !== false, is_popular: !!editingProduct.is_popular,
        sort_order: Number(editingProduct.sort_order || products.length + 1),
      } as ProrabProduct & { name: string; price: number });
      toast.success(adminT("admin.ui.0720"));
      setProductDialogOpen(false); setEditingProduct(null);
      await loadAll();
    } catch { toast.error(adminT("admin.ui.0055")); }
  }

  async function saveAllSettings(extra?: Record<string, string>) {
    const payload = {
      ...settings, ...extra,
      store_lat: String(storeLat), store_lng: String(storeLng),
      delivery_zones: serializeDeliveryZones(deliveryZones),
    } as Record<string, string>;
    const saved = await saveProrabSettings(payload);
    setSettings(saved);
    return saved;
  }

  if (loading) return <div className="p-8 text-center text-gray-400">{adminT("admin.ui.1026")}</div>;

  return (
    <>
      <div className="space-y-4 md:space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <HardHat className="h-6 w-6 text-amber-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">PRORAB</h1>
              <p className="text-sm text-gray-500">{adminT("admin.ui.1027")}</p>
            </div>
          </div>
          <a href="/prorab" target="_blank" rel="noopener noreferrer" className="text-sm text-amber-600 hover:underline">
            {adminT("admin.ui.0733")} </a>
        </div>

        <div className="flex gap-2 flex-wrap">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSection(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${section === id ? ACCENT_LIGHT + ' border' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
              <Icon className="h-4 w-4" />{label}
              {id === 'orders' && newOrdersCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">{newOrdersCount}</span>
              )}
            </button>
          ))}
        </div>

        {section === 'products' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">{products.length} {adminT("admin.ui.0736")}</p>
              <Button size="sm" onClick={() => { setEditingProduct({ is_active: true, is_popular: false, sort_order: products.length + 1 }); setProductDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedProducts.map(p => (
                <div key={p.id} className="bg-white border rounded-xl overflow-hidden">
                  <div className="aspect-video bg-gray-50 relative">
                    {p.image_url && <img src={resolveImageSrc(p.image_url) || p.image_url} alt="" className="w-full h-full object-cover" />}
                    {p.is_popular && <Badge className="absolute top-2 left-2 bg-amber-500">{adminT("admin.ui.0506")}</Badge>}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm line-clamp-2">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.weight} · {Math.round(p.price).toLocaleString(adminLocale)} ₸</p>
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => { setEditingProduct({ ...p }); setProductDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600" onClick={async () => { if (!confirm(adminT("admin.ui.1028"))) return; await deleteProrabProduct(p.id); await loadAll(); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'categories' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditingCat({ is_active: true, sort_order: categories.length + 1 }); setCategoryDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> {adminT("admin.ui.0231")} </Button>
            </div>
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-white border rounded-xl p-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  {c.image_url && <img src={resolveImageSrc(c.image_url) || c.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0"><p className="font-medium text-sm">{c.name}</p></div>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => { setEditingCat({ ...c }); setCategoryDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600" onClick={async () => { if (!confirm(adminT("admin.ui.1028"))) return; try { await deleteProrabCategory(c.id); await loadAll(); } catch (e) { toast.error(e instanceof Error ? e.message : adminT("admin.ui.0486")); } }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}

        {section === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-1.5 overflow-x-auto">
                {ORDER_FILTERS.map(f => (
                  <button key={f.id} onClick={() => setOrderFilter(f.id)}
                    className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium ${orderFilter === f.id ? ACCENT + ' text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => void loadAll()}><RefreshCw className="h-4 w-4 mr-1" /> {adminT("admin.ui.0408")}</Button>
            </div>
            {filteredOrders.map(o => {
              let items: { name: string; qty: number; sum: number }[] = [];
              try { items = JSON.parse(o.order_items || '[]'); } catch { /* ignore */ }
              return (
                <div key={o.id} className="bg-white border rounded-xl p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-bold">{adminT("admin.ui.0743")}{o.id}</p>
                      <p className="text-sm">{o.customer_name}</p>
                      <a href={`tel:${o.customer_phone}`} className="text-sm text-amber-600 font-medium">{o.customer_phone}</a>
                      <p className="text-xs text-gray-400">{o.customer_address}</p>
                    </div>
                    <Badge>{ORDER_STATUS[o.status || 'new']}</Badge>
                  </div>
                  {items.map((it, i) => <div key={i} className="text-sm flex justify-between text-gray-600"><span>{it.name} ×{it.qty}</span><span>{it.sum} ₸</span></div>)}
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-bold text-amber-700">{Math.round(o.total_amount).toLocaleString(adminLocale)} ₸</span>
                    <span className="text-xs text-gray-400">{formatOrderDate(o.created_at, adminLocale)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:flex gap-1.5">
                    {(['new', 'processing', 'delivered', 'cancelled'] as const).map(s => (
                      <button key={s} onClick={async () => { await updateProrabOrderStatus(o.id, s); toast.success(adminT("admin.ui.0047")); await loadAll(); }}
                        className={`text-xs px-3 py-2 rounded-lg ${o.status === s ? 'bg-amber-100 text-amber-800 font-medium' : 'bg-gray-100'}`}>
                        {ORDER_STATUS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {section === 'delivery' && (
          <div className="space-y-4">
            <DeliveryZoneEditor zones={deliveryZones} storeLat={storeLat} storeLng={storeLng}
              onZonesChange={setDeliveryZones} onStoreChange={(lat, lng) => { setStoreLat(lat); setStoreLng(lng); }} />
            <Textarea value={settings.outside_zone_message || ''} onChange={(e) => setSettings(s => ({ ...s, outside_zone_message: e.target.value }))} rows={2} placeholder={adminT("admin.ui.1029")} />
            <Button className={ACCENT} onClick={async () => { try { await saveAllSettings(); toast.success(adminT("admin.ui.1030")); } catch { toast.error(adminT("admin.ui.0486")); } }}>
              <Save className="h-4 w-4 mr-1" /> {adminT("admin.ui.0748")} </Button>
          </div>
        )}

        {section === 'settings' && (
          <div className="space-y-6">
          <div className="bg-white border rounded-xl p-4 space-y-4 max-w-lg">
            <ImageUpload value={settings.logo_url || ''} onChange={(url) => setSettings(s => ({ ...s, logo_url: url }))} />
            <ImageUpload value={settings.hero_image_url || ''} onChange={(url) => setSettings(s => ({ ...s, hero_image_url: url }))} />
            {[
              ['store_name', adminT("admin.ui.0754")], ['store_tagline', adminT("admin.ui.0120")], ['hero_title', adminT("admin.ui.0119")],
              ['default_address', adminT("admin.ui.0566")], ['delivery_time', adminT("admin.ui.0575")],
              ['min_order', adminT("admin.ui.0757")], ['delivery_fee', adminT("admin.ui.1031")],
              ['free_delivery_from', adminT("admin.ui.0558")], ['store_phone', adminT("admin.ui.0759")],
              ['operator_note', adminT("admin.ui.1032")],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
                <Input value={settings[key] || ''} onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.value }))} />
              </div>
            ))}
            <Button className={`w-full ${ACCENT}`} onClick={async () => { try { await saveAllSettings(); toast.success(adminT("admin.ui.1033")); } catch { toast.error(adminT("admin.ui.0486")); } }}>
              <Save className="h-4 w-4 mr-1" /> {adminT("admin.ui.0760")} </Button>
            <p className="text-xs text-gray-400">
              {adminT("admin.ui.1034")} </p>
          </div>
          {!partnerMode && <AdminPartnerAccess partnerType="prorab" />}
          </div>
        )}
      </div>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className={`max-w-2xl ${MOBILE_DIALOG}`}>
          <DialogHeader><DialogTitle>{editingProduct?.id ? adminT("admin.ui.0073") : adminT("admin.ui.0765")}</DialogTitle></DialogHeader>
          {editingProduct && (
            <div className="space-y-3">
              <Input placeholder={adminT("admin.ui.0213")} value={editingProduct.name || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, name: e.target.value }) : p)} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder={adminT("admin.ui.0081")} value={editingProduct.price ?? ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, price: Number(e.target.value) }) : p)} />
                <Input placeholder={adminT("admin.ui.1035")} value={editingProduct.weight || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, weight: e.target.value }) : p)} />
              </div>
              <select className="border rounded-md px-3 py-2 w-full text-sm" value={editingProduct.category_id ?? ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, category_id: Number(e.target.value) }) : p)}>
                <option value="">{adminT("admin.ui.0231")}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Textarea placeholder={adminT("admin.ui.0079")} value={editingProduct.description || ''} onChange={(e) => setEditingProduct(p => p ? ({ ...p, description: e.target.value }) : p)} rows={2} />
              <ImageUpload value={editingProduct.image_url || ''} onChange={(url) => setEditingProduct(p => p ? ({ ...p, image_url: url }) : p)} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editingProduct.is_popular} onChange={(e) => setEditingProduct(p => p ? ({ ...p, is_popular: e.target.checked }) : p)} /> {adminT("admin.ui.0738")}</label>
              <Button className={ACCENT} onClick={() => void handleSaveProduct()}><Save className="h-4 w-4 mr-1" /> {adminT("admin.ui.0096")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className={MOBILE_DIALOG}>
          <DialogHeader><DialogTitle>{editingCat?.id ? adminT("admin.ui.0231") : adminT("admin.ui.0178")}</DialogTitle></DialogHeader>
          {editingCat && (
            <div className="space-y-3">
              <Input placeholder={adminT("admin.ui.0213")} value={editingCat.name || ''} onChange={(e) => setEditingCat(c => c ? ({ ...c, name: e.target.value }) : c)} />
              <ImageUpload value={editingCat.image_url || ''} onChange={(url) => setEditingCat(c => c ? ({ ...c, image_url: url }) : c)} />
              <Button className={ACCENT} onClick={() => void handleSaveCategory()}><Save className="h-4 w-4 mr-1" /> {adminT("admin.ui.0096")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
