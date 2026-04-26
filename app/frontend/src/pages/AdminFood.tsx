import { useEffect, useMemo, useState } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
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
interface FoodCategory { id: number; restaurant_id: number; name: string; icon: string; sort_order: number; is_active: boolean; }
interface FoodItem { id: number; restaurant_id: number; category_id: number; name: string; description: string; price: number; image_url: string; available: boolean; is_active: boolean; sort_order: number; }
type Section = 'restaurants' | 'categories' | 'items';

export default function AdminFood() {
  const [section, setSection] = useState<Section>('items');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [editingRestaurant, setEditingRestaurant] = useState<Partial<Restaurant> | null>(null);
  const [editingCat, setEditingCat] = useState<Partial<FoodCategory> | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<FoodItem> | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll(keepRestaurant = true) {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        withRetry(() => client.entities.food_restaurants.query({ sort: 'sort_order', limit: 200 })),
        withRetry(() => client.entities.food_categories.query({ sort: 'sort_order', limit: 100 })),
        withRetry(() => client.entities.food_items.query({ sort: 'sort_order', limit: 200 })),
      ]);
      const extract = (r: PromiseSettledResult<any>) =>
        r.status === 'fulfilled' ? (r.value?.data?.items || []) : [];

      const rs = extract(results[0]) as Restaurant[];
      const cs = extract(results[1]) as FoodCategory[];
      const ds = extract(results[2]) as FoodItem[];
      setRestaurants(rs);
      setCategories(cs);
      setItems(ds);
      if (!keepRestaurant || !selectedRestaurantId) setSelectedRestaurantId(rs[0]?.id || null);

      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0 && failedCount < results.length) toast.error('Часть данных не загрузилась');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  const filteredCategories = useMemo(
    () => categories.filter(c => !selectedRestaurantId || c.restaurant_id === selectedRestaurantId),
    [categories, selectedRestaurantId]
  );
  const filteredItems = useMemo(
    () => items.filter(i => !selectedRestaurantId || i.restaurant_id === selectedRestaurantId),
    [items, selectedRestaurantId]
  );

  async function saveRestaurant() {
    if (!editingRestaurant?.name) return toast.error('Введите название ресторана');
    try {
      const payload = {
        ...editingRestaurant,
        min_order: Number(editingRestaurant.min_order || 0),
        rating: Number(editingRestaurant.rating || 4.5),
        is_active: editingRestaurant.is_active !== false,
      };
      if (editingRestaurant.id) {
        const { id, ...data } = payload;
        await withRetry(() => client.entities.food_restaurants.update({ id: String(id), data }));
      } else {
        await withRetry(() => client.entities.food_restaurants.create({ data: { ...payload, created_at: new Date().toISOString() } }));
      }
      toast.success('Ресторан сохранен');
      setEditingRestaurant(null);
      invalidateAllCaches();
      loadAll(false);
    } catch { toast.error('Ошибка сохранения'); }
  }

  async function deleteRestaurant(id: number) {
    if (!confirm('Удалить ресторан?')) return;
    try {
      await withRetry(() => client.entities.food_restaurants.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      loadAll(false);
    } catch { toast.error('Ошибка удаления'); }
  }

  async function saveCat() {
    if (!editingCat?.name || !editingCat.restaurant_id) return;
    try {
      if (editingCat.id) {
        const { id, ...updateData } = editingCat;
        await withRetry(() => client.entities.food_categories.update({ id: String(id), data: updateData }));
      } else {
        await withRetry(() => client.entities.food_categories.create({
          data: { ...editingCat, is_active: true, sort_order: editingCat.sort_order || categories.length + 1, created_at: new Date().toISOString() }
        }));
      }
      toast.success('Категория сохранена');
      invalidateAllCaches();
      setEditingCat(null);
      loadAll();
    } catch { toast.error('Ошибка сохранения'); }
  }

  async function deleteCat(id: number) {
    if (!confirm('Удалить категорию?')) return;
    try {
      await withRetry(() => client.entities.food_categories.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      loadAll();
    } catch { toast.error('Ошибка удаления'); }
  }

  // ─── Items CRUD ───
  async function saveItem() {
    if (!editingItem?.name || !editingItem?.price || !editingItem?.category_id || !editingItem.restaurant_id) {
      toast.error('Заполните название, цену и категорию');
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
              is_active: editingItem.is_active !== false,
              available: editingItem.available !== false,
              sort_order: editingItem.sort_order || items.length + 1,
              created_at: new Date().toISOString(),
            },
          })
        );
      }
      toast.success('Блюдо сохранено');
      invalidateAllCaches();
      setEditingItem(null);
      loadAll();
    } catch { toast.error('Ошибка сохранения'); }
  }

  async function deleteItem(id: number) {
    if (!confirm('Удалить блюдо?')) return;
    try {
      await withRetry(() => client.entities.food_items.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      loadAll();
    } catch { toast.error('Ошибка удаления'); }
  }

  async function toggleItemAvailable(item: FoodItem) {
    try {
      await withRetry(() => client.entities.food_items.update({ id: String(item.id), data: { available: !(item.available !== false) } }));
      loadAll();
    } catch { toast.error('Ошибка'); }
  }

  if (loading) {
    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        {([
          { id: 'restaurants' as Section, label: 'Рестораны' },
          { id: 'categories' as Section, label: 'Категории меню' },
          { id: 'items' as Section, label: 'Блюда' },
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
        <select
          value={selectedRestaurantId || ''}
          onChange={(e) => setSelectedRestaurantId(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {section === 'restaurants' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Рестораны</h3>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditingRestaurant({ name: '', rating: 4.5, min_order: 0, is_active: true })}>
              <Plus className="w-4 h-4 mr-1" /> Добавить
            </Button>
          </div>
          {editingRestaurant && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <Input placeholder="Название" value={editingRestaurant.name || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, name: e.target.value })} />
              <Textarea placeholder="Описание" value={editingRestaurant.description || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="WhatsApp телефон" value={editingRestaurant.whatsapp_phone || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, whatsapp_phone: e.target.value })} />
                <Input placeholder="Время работы" value={editingRestaurant.working_hours || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, working_hours: e.target.value })} />
                <Input placeholder="Срок доставки (35-45 мин)" value={editingRestaurant.delivery_time || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, delivery_time: e.target.value })} />
                <Input placeholder="Кухня (pizza,sushi)" value={editingRestaurant.cuisine_type || ''} onChange={e => setEditingRestaurant({ ...editingRestaurant, cuisine_type: e.target.value })} />
                <Input type="number" placeholder="Мин. заказ" value={editingRestaurant.min_order || 0} onChange={e => setEditingRestaurant({ ...editingRestaurant, min_order: Number(e.target.value) })} />
                <Input type="number" step="0.1" placeholder="Рейтинг" value={editingRestaurant.rating || 4.5} onChange={e => setEditingRestaurant({ ...editingRestaurant, rating: Number(e.target.value) })} />
              </div>
              <ImageUpload value={editingRestaurant.photo || ''} onChange={key => setEditingRestaurant({ ...editingRestaurant, photo: key })} folder="food" compact />
              <div className="flex gap-2">
                <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={saveRestaurant}><Save className="w-4 h-4 mr-1" />Сохранить</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingRestaurant(null)}><X className="w-4 h-4 mr-1" />Отмена</Button>
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
                    <div className="text-xs text-gray-500">{r.cuisine_type} • {r.delivery_time} • мин. {r.min_order} ₸</div>
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
            <h3 className="font-bold text-lg">Категории еды</h3>
            <Button
              size="sm"
              onClick={() =>
                setEditingCat({ name: '', icon: '🍽', restaurant_id: selectedRestaurantId || undefined, sort_order: categories.length + 1 })
              }
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Plus className="w-4 h-4 mr-1" /> Добавить
            </Button>
          </div>

          {editingCat && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input placeholder="Иконка (emoji)" value={editingCat.icon || ''} onChange={e => setEditingCat({ ...editingCat, icon: e.target.value })} />
                <Input placeholder="Название" value={editingCat.name || ''} onChange={e => setEditingCat({ ...editingCat, name: e.target.value })} className="sm:col-span-2" />
              </div>
              <Input placeholder="Restaurant ID" value={editingCat.restaurant_id || selectedRestaurantId || ''} onChange={e => setEditingCat({ ...editingCat, restaurant_id: Number(e.target.value) })} />
              <Input type="number" placeholder="Порядок" value={editingCat.sort_order || ''} onChange={e => setEditingCat({ ...editingCat, sort_order: parseInt(e.target.value) || 0 })} className="w-32" />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveCat} className="bg-orange-500 hover:bg-orange-600"><Save className="w-4 h-4 mr-1" /> Сохранить</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingCat(null)}><X className="w-4 h-4 mr-1" /> Отмена</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {filteredCategories.map(cat => (
              <div key={cat.id} className="bg-white rounded-xl border p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <div>
                    <span className="font-medium text-sm">{cat.name}</span>
                    <span className="text-xs text-gray-500 ml-2">restaurant #{cat.restaurant_id}</span>
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
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Блюда</h3>
            <Button
              size="sm"
              onClick={() =>
                setEditingItem({
                  name: '',
                  price: 0,
                  category_id: categories[0]?.id,
                  restaurant_id: selectedRestaurantId || restaurants[0]?.id,
                  description: '',
                  available: true,
                  is_active: true,
                })
              }
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Plus className="w-4 h-4 mr-1" /> Добавить
            </Button>
          </div>

          {editingItem && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Название *" value={editingItem.name || ''} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} />
                <Input type="number" placeholder="Restaurant ID *" value={editingItem.restaurant_id || selectedRestaurantId || ''} onChange={e => setEditingItem({ ...editingItem, restaurant_id: Number(e.target.value) })} />
                <select
                  value={editingItem.category_id || ''}
                  onChange={e => setEditingItem({ ...editingItem, category_id: parseInt(e.target.value) })}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Категория *</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <Textarea placeholder="Описание" value={editingItem.description || ''} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} rows={2} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Цена *" value={editingItem.price || ''} onChange={e => setEditingItem({ ...editingItem, price: parseInt(e.target.value) || 0 })} />
                <Input type="number" placeholder="Порядок" value={editingItem.sort_order || ''} onChange={e => setEditingItem({ ...editingItem, sort_order: parseInt(e.target.value) || 0 })} />
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
                  Активное
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingItem.available !== false} onChange={e => setEditingItem({ ...editingItem, available: e.target.checked })} />
                  Доступно
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveItem} className="bg-orange-500 hover:bg-orange-600"><Save className="w-4 h-4 mr-1" /> Сохранить</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}><X className="w-4 h-4 mr-1" /> Отмена</Button>
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
                        {item.available !== false ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">Доступно</Badge> : <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">Недоступно</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{cat?.name}</span>
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