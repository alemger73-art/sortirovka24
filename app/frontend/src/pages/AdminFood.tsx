import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useMemo, useState } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import {
  fetchFoodRestaurantsList,
  createFoodRestaurant,
  updateFoodRestaurant,
  deleteFoodRestaurant,
} from '@/lib/foodAdminApi';
import { DAM_ALEM_BRAND, findDamAlemRestaurantId, isDamAlemName } from '@/lib/damAlem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';

/* ─── Types ─── */
interface Restaurant {
  id: number;
  name: string;
  photo: string;
  description: string;
  whatsapp_phone: string;
  working_hours: string;
  min_order: number;
  delivery_time: string;
  cuisine_type: string;
  rating: number;
  is_active: boolean;
  sort_order: number;
}
interface FoodCategory {
  id: number;
  restaurant_id?: number | null;
  name: string;
  icon: string;
  slug?: string;
  image?: string;
  category_type?: string;
  sort_order: number;
  is_active: boolean;
}
interface FoodItem {
  id: number;
  restaurant_id?: number | null;
  category_id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
  available: boolean;
  is_active: boolean;
  is_popular?: boolean;
  is_combo?: boolean;
  is_recommended?: boolean;
  weight?: string;
  sort_order: number;
}
type Section = 'restaurants' | 'categories' | 'items';

interface AdminFoodProps {
  damAlemMode?: boolean;
  initialSection?: Section;
  hideSubTabs?: boolean;
}

export default function AdminFood({ damAlemMode = false, initialSection, hideSubTabs = false }: AdminFoodProps) {
  const { t: adminT } = useLanguage();

  const [section, setSection] = useState<Section>(initialSection || (damAlemMode ? 'items' : 'items'));
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [editingRestaurant, setEditingRestaurant] = useState<Partial<Restaurant> | null>(null);
  const [editingCat, setEditingCat] = useState<Partial<FoodCategory> | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<FoodItem> | null>(null);
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  async function loadAll(keepRestaurant = true) {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        fetchFoodRestaurantsList(),
        withRetry(() => client.entities.food_categories.query({ sort: 'sort_order', limit: 500 })),
        withRetry(() => client.entities.food_items.query({ sort: 'sort_order', limit: 2000 })),
      ]);
      const extract = (r: PromiseSettledResult<any>, idx: number) => {
        if (r.status !== 'fulfilled') return [];
        if (idx === 0) return (r.value || []) as Restaurant[];
        return (r.value?.data?.items || []) as FoodCategory[] | FoodItem[];
      };

      const rs = extract(results[0], 0) as Restaurant[];
      const cs = extract(results[1], 1) as FoodCategory[];
      const ds = extract(results[2], 2) as FoodItem[];
      const hasLegacy =
        cs.some(c => c.restaurant_id == null || c.restaurant_id === undefined) ||
        ds.some(d => d.restaurant_id == null || d.restaurant_id === undefined);

      setRestaurants(rs);
      setCategories(cs);
      setItems(ds);

      const damAlemId = findDamAlemRestaurantId(rs);

      setSelectedRestaurantId(prev => {
        if (damAlemMode) {
          if (damAlemId != null) return damAlemId;
          return prev;
        }
        if (!keepRestaurant) {
          if (prev != null && rs.some(r => r.id === prev)) return prev;
          return rs[0]?.id ?? null;
        }
        if (prev != null && rs.some(r => r.id === prev)) return prev;
        if (prev === null) {
          if (!hasLegacy && rs.length > 0) return damAlemId ?? rs[0].id;
          return null;
        }
        return damAlemId ?? rs[0]?.id ?? null;
      });

      const failedCount = results.filter((r, i) => i > 0 && r.status === 'rejected').length;
      if (failedCount > 0) toast.error(adminT("admin.ui.0478"));
    } catch (e) {
      console.error(e);
      toast.error(adminT("admin.ui.0044"));
    } finally {
      setLoading(false);
    }
  }

  const filteredCategories = useMemo(
    () =>
      categories.filter(c =>
        selectedRestaurantId === null
          ? c.restaurant_id == null || c.restaurant_id === undefined
          : c.restaurant_id === selectedRestaurantId
      ),
    [categories, selectedRestaurantId]
  );
  const filteredItems = useMemo(() => {
    const byRestaurant = items.filter(i =>
      selectedRestaurantId === null
        ? i.restaurant_id == null || i.restaurant_id === undefined
        : i.restaurant_id === selectedRestaurantId
    );
    const q = itemSearch.trim().toLowerCase();
    if (!q) return byRestaurant;
    return byRestaurant.filter(i =>
      i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
    );
  }, [items, selectedRestaurantId, itemSearch]);

  async function saveRestaurant() {
    if (!editingRestaurant?.name) return toast.error(adminT("admin.ui.0479"));
    try {
      const payload = {
        ...editingRestaurant,
        min_order: Number(editingRestaurant.min_order || 0),
        rating: Number(editingRestaurant.rating || 4.5),
        is_active: editingRestaurant.is_active !== false,
      };
      if (editingRestaurant.id) {
        const { id, ...data } = payload;
        await updateFoodRestaurant(id, { ...data });
      } else {
        await createFoodRestaurant({ ...payload, created_at: new Date().toISOString() });
      }
      toast.success(adminT("admin.ui.0480"));
      setEditingRestaurant(null);
      invalidateAllCaches();
      loadAll(false);
    } catch { toast.error(adminT("admin.ui.0055")); }
  }

  async function deleteRestaurant(id: number) {
    if (!confirm(adminT("admin.ui.0481"))) return;
    try {
      await deleteFoodRestaurant(id);
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      loadAll(false);
    } catch { toast.error(adminT("admin.ui.0051")); }
  }

  async function saveCat() {
    if (!editingCat?.name) return;
    try {
      if (editingCat.id) {
        const { id, ...updateData } = editingCat;
        await withRetry(() => client.entities.food_categories.update({ id: String(id), data: updateData }));
      } else {
        await withRetry(() => client.entities.food_categories.create({
          data: {
            ...editingCat,
            restaurant_id: editingCat.restaurant_id ?? selectedRestaurantId ?? undefined,
            is_active: true,
            sort_order: editingCat.sort_order || categories.length + 1,
            created_at: new Date().toISOString(),
          }
        }));
      }
      toast.success(adminT("admin.ui.0482"));
      invalidateAllCaches();
      setEditingCat(null);
      loadAll();
    } catch { toast.error(adminT("admin.ui.0055")); }
  }

  async function deleteCat(id: number) {
    if (!confirm(adminT("admin.ui.0196"))) return;
    try {
      await withRetry(() => client.entities.food_categories.delete({ id: String(id) }));
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      loadAll();
    } catch { toast.error(adminT("admin.ui.0051")); }
  }

  // ─── Items CRUD ───
  async function saveItem() {
    if (!editingItem?.name || !editingItem?.price || !editingItem?.category_id) {
      toast.error(adminT("admin.ui.0483"));
      return;
    }
    try {
      if (editingItem.id) {
        const { id, ...rest } = editingItem;
        await withRetry(() => client.entities.food_items.update({ id: String(id), data: rest }));
      } else {
        await withRetry(() =>
          client.entities.food_items.create({
            data: {
              ...editingItem,
              restaurant_id: editingItem.restaurant_id ?? selectedRestaurantId ?? undefined,
              is_active: editingItem.is_active !== false,
              available: editingItem.available !== false,
              sort_order: editingItem.sort_order || items.length + 1,
              created_at: new Date().toISOString(),
            },
          })
        );
      }
      toast.success(adminT("admin.ui.0484"));
      invalidateAllCaches();
      setEditingItem(null);
      loadAll();
    } catch { toast.error(adminT("admin.ui.0055")); }
  }

  async function deleteItem(id: number) {
    if (!confirm(adminT("admin.ui.0485"))) return;
    try {
      await withRetry(() => client.entities.food_items.delete({ id: String(id) }));
      toast.success(adminT("admin.ui.0050"));
      invalidateAllCaches();
      loadAll();
    } catch { toast.error(adminT("admin.ui.0051")); }
  }

  async function toggleItemAvailable(item: FoodItem) {
    try {
      await withRetry(() => client.entities.food_items.update({ id: String(item.id), data: { available: !(item.available !== false) } }));
      loadAll();
    } catch { toast.error(adminT("admin.ui.0486")); }
  }

  if (loading) {
    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      {!hideSubTabs && <div className="flex gap-2 flex-wrap items-center">
        {([
          ...(!damAlemMode ? [{ id: 'restaurants' as Section, label: adminT("admin.ui.0487") }] : []),
          { id: 'categories' as Section, label: adminT("admin.ui.0488") },
          { id: 'items' as Section, label: adminT("admin.ui.0241") },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === t.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
        {!damAlemMode && (
        <select
          value={selectedRestaurantId === null ? '' : String(selectedRestaurantId)}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedRestaurantId(v === '' ? null : Number(v));
          }}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">{adminT("admin.ui.0489")}</option>
          {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        )}
        {damAlemMode && (
          <span className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-800">
            {restaurants.find(r => isDamAlemName(r.name))?.name || DAM_ALEM_BRAND}
          </span>
        )}
      </div>}

      {section === 'restaurants' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">{adminT("admin.ui.0487")}</h3>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setEditingRestaurant({ name: '', rating: 4.5, min_order: 0, is_active: true })}>
              <Plus className="w-4 h-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
          </div>
          {editingRestaurant && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <Input placeholder={adminT("admin.ui.0213")} value={editingRestaurant.name || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, name: e.target.value })} />
              <Textarea placeholder={adminT("admin.ui.0079")} value={editingRestaurant.description || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder={adminT("admin.ui.0490")} value={editingRestaurant.whatsapp_phone || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, whatsapp_phone: e.target.value })} />
                <Input placeholder={adminT("admin.ui.0334")} value={editingRestaurant.working_hours || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, working_hours: e.target.value })} />
                <Input placeholder={adminT("admin.ui.0491")} value={editingRestaurant.delivery_time || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, delivery_time: e.target.value })} />
                <Input placeholder={adminT("admin.ui.0492")} value={editingRestaurant.cuisine_type || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, cuisine_type: e.target.value })} />
                <Input type="number" placeholder={adminT("admin.ui.0493")} value={editingRestaurant.min_order || 0} onChange={e => setEditingRestaurant({ ...editingRestaurant, min_order: Number(e.target.value) })} />
                <Input type="number" step="0.1" placeholder={adminT("admin.ui.0338")} value={editingRestaurant.rating || 4.5} onChange={e => setEditingRestaurant({ ...editingRestaurant, rating: Number(e.target.value) })} />
              </div>
              <ImageUpload value={editingRestaurant.photo || ''} onChange={key => setEditingRestaurant({ ...editingRestaurant, photo: key })} folder="food" compact />
              <div className="flex gap-2">
                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={saveRestaurant}><Save className="w-4 h-4 mr-1" />{adminT("admin.ui.0096")}</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingRestaurant(null)}><X className="w-4 h-4 mr-1" />{adminT("admin.ui.0095")}</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {restaurants.map(r => (
              <div key={r.id} className="bg-white rounded-xl border p-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {r.photo ? <StorageImage objectKey={r.photo} alt={r.name} className="w-12 h-12 rounded-lg" /> : <div className="w-12 h-12 rounded-lg bg-orange-100" />}
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.cuisine_type} • {r.delivery_time} {adminT("admin.ui.0494")} {r.min_order} ₸</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditingRestaurant(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteRestaurant(r.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">{adminT("admin.ui.0495")}</h3>
            <Button
              size="sm"
              onClick={() =>
                setEditingCat({ name: '', icon: '🍽', restaurant_id: selectedRestaurantId || undefined, sort_order: categories.length + 1 })
              }
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
          </div>

          {editingCat && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input placeholder={adminT("admin.ui.0496")} value={editingCat.icon || ''} onChange={e => setEditingCat({ ...editingCat, icon: e.target.value })} />
                <Input placeholder={adminT("admin.ui.0077")} value={editingCat.name || ''} onChange={e => setEditingCat({ ...editingCat, name: e.target.value })} className="sm:col-span-2" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Slug (url)" value={editingCat.slug || ''} onChange={e => setEditingCat({ ...editingCat, slug: e.target.value })} />
                <Input placeholder={adminT("admin.ui.0497")} value={editingCat.category_type || ''} onChange={e => setEditingCat({ ...editingCat, category_type: e.target.value })} />
              </div>
              {!damAlemMode && (
                <Input placeholder="Restaurant ID" value={editingCat.restaurant_id || selectedRestaurantId || ''} onChange={e => setEditingCat({ ...editingCat, restaurant_id: Number(e.target.value) })} />
              )}
              <ImageUpload
                value={editingCat.image || ''}
                onChange={key => setEditingCat({ ...editingCat, image: key })}
                folder="food"
                compact
              />
              <Input type="number" placeholder={adminT("admin.ui.0216")} value={editingCat.sort_order || ''} onChange={e => setEditingCat({ ...editingCat, sort_order: parseInt(e.target.value) || 0 })} className="w-32" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editingCat.is_active !== false} onChange={e => setEditingCat({ ...editingCat, is_active: e.target.checked })} />
                {adminT("admin.ui.0498")} </label>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveCat} className="bg-orange-500 hover:bg-orange-600 text-white"><Save className="w-4 h-4 mr-1" /> {adminT("admin.ui.0096")}</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingCat(null)}><X className="w-4 h-4 mr-1" /> {adminT("admin.ui.0095")}</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {filteredCategories.map(cat => (
              <div key={cat.id} className={`bg-white rounded-xl border p-3 flex items-center justify-between ${cat.is_active === false ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  {cat.image ? (
                    <StorageImage objectKey={cat.image} alt={cat.name} className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <span className="text-2xl">{cat.icon}</span>
                  )}
                  <div>
                    <span className="font-medium text-sm">{cat.name}</span>
                    {cat.slug && <span className="text-xs text-gray-400 ml-2">/{cat.slug}</span>}
                    {!damAlemMode && <span className="text-xs text-gray-500 ml-2">restaurant #{cat.restaurant_id}</span>}
                    <span className="text-xs text-gray-400 ml-2">#{cat.sort_order}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditingCat(cat)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteCat(cat.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'items' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-lg">{adminT("admin.ui.0241")}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder={adminT("admin.ui.0210")}
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                className="h-9 w-40"
              />
              <Button
                size="sm"
                onClick={() =>
                  setEditingItem({
                    name: '',
                    price: 0,
                    category_id: filteredCategories[0]?.id,
                    restaurant_id: selectedRestaurantId || restaurants[0]?.id,
                    description: '',
                    available: true,
                    is_active: true,
                  })
                }
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="w-4 h-4 mr-1" /> {adminT("admin.ui.0062")} </Button>
            </div>
          </div>

          {editingItem && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder={adminT("admin.ui.0077")} value={editingItem.name || ''} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} />
                {!damAlemMode && (
                  <Input type="number" placeholder="Restaurant ID *" value={editingItem.restaurant_id || selectedRestaurantId || ''} onChange={e => setEditingItem({ ...editingItem, restaurant_id: Number(e.target.value) })} />
                )}
                <select
                  value={editingItem.category_id || ''}
                  onChange={e => setEditingItem({ ...editingItem, category_id: parseInt(e.target.value) })}
                  className="border rounded-lg px-3 py-2 text-sm sm:col-span-2"
                >
                  <option value="">{adminT("admin.ui.0459")}</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <Textarea placeholder={adminT("admin.ui.0079")} value={editingItem.description || ''} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} rows={2} />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Input type="number" placeholder={adminT("admin.ui.0499")} value={editingItem.price || ''} onChange={e => setEditingItem({ ...editingItem, price: parseInt(e.target.value) || 0 })} />
                <Input placeholder={adminT("admin.ui.0500")} value={editingItem.weight || ''} onChange={e => setEditingItem({ ...editingItem, weight: e.target.value })} />
                <Input type="number" placeholder={adminT("admin.ui.0216")} value={editingItem.sort_order || ''} onChange={e => setEditingItem({ ...editingItem, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
              <ImageUpload
                value={editingItem.image_url || ''}
                onChange={(key) => setEditingItem({ ...editingItem, image_url: key })}
                folder="food"
                compact
              />
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingItem.is_active !== false} onChange={e => setEditingItem({ ...editingItem, is_active: e.target.checked })} />
                  {adminT("admin.ui.0501")} </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingItem.available !== false} onChange={e => setEditingItem({ ...editingItem, available: e.target.checked })} />
                  {adminT("admin.ui.0502")} </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!editingItem.is_popular} onChange={e => setEditingItem({ ...editingItem, is_popular: e.target.checked })} />
                  {adminT("admin.ui.0503")} </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!editingItem.is_combo} onChange={e => setEditingItem({ ...editingItem, is_combo: e.target.checked })} />
                  {adminT("admin.ui.0504")} </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!editingItem.is_recommended} onChange={e => setEditingItem({ ...editingItem, is_recommended: e.target.checked })} />
                  {adminT("admin.ui.0505")} </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveItem} className="bg-orange-500 hover:bg-orange-600 text-white"><Save className="w-4 h-4 mr-1" /> {adminT("admin.ui.0096")}</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}><X className="w-4 h-4 mr-1" /> {adminT("admin.ui.0095")}</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {filteredItems.map(item => {
              const cat = categories.find(c => c.id === item.category_id);
              return (
                <div key={item.id} className={`bg-white rounded-xl border p-3 flex items-center justify-between ${(item.available === false || !item.is_active) ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.image_url ? (
                      <StorageImage objectKey={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0 text-lg">
                        {cat?.icon || '🍽'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{item.name}</span>
                        {item.is_popular && <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px]">{adminT("admin.ui.0506")}</Badge>}
                        {item.is_combo && <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px]">{adminT("admin.ui.0504")}</Badge>}
                        {item.is_recommended && <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">★</Badge>}
                        {item.available !== false ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">{adminT("admin.ui.0502")}</Badge> : <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">{adminT("admin.ui.0507")}</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{cat?.name}</span>
                        {item.weight && <><span>•</span><span>{item.weight}</span></>}
                        <span>•</span>
                        <span className="font-semibold text-gray-700">{item.price} ₸</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => toggleItemAvailable(item)} className={item.available !== false ? 'text-green-600' : 'text-gray-400'}>
                      {item.available !== false ? '✓' : '✗'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingItem(item)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteItem(item.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}