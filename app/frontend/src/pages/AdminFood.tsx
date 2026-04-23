import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, Settings2, ToggleLeft, ToggleRight, GripVertical, CircleDot, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';

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
  is_popular?: boolean;
  is_combo?: boolean;
  weight: string;
  sort_order: number;
  available_in_park: boolean;
}
interface ModifierGroup { id: number; name: string; type: string; is_required: boolean; min_select: number; max_select: number; sort_order: number; is_active: boolean; }
interface ModifierOption { id: number; group_id: number; name: string; price: number; sort_order: number; is_active: boolean; }
interface ItemModGroupLink { id: number; food_item_id: number; modifier_group_id: number; sort_order: number; }

type Section = 'categories' | 'items' | 'modifier-groups' | 'links';

export default function AdminFood() {
  const [section, setSection] = useState<Section>('items');
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [options, setOptions] = useState<ModifierOption[]>([]);
  const [groupLinks, setGroupLinks] = useState<ItemModGroupLink[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit states
  const [editingCat, setEditingCat] = useState<Partial<FoodCategory> | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<FoodItem> | null>(null);
  const [editingGroup, setEditingGroup] = useState<Partial<ModifierGroup> | null>(null);
  const [editingOption, setEditingOption] = useState<{ groupId: number; data: Partial<ModifierOption> } | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const [linkItemId, setLinkItemId] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        withRetry(() => client.entities.food_categories.query({ sort: 'sort_order', limit: 100 })),
        withRetry(() => client.entities.food_items.query({ sort: 'sort_order', limit: 200 })),
        withRetry(() => client.entities.modifier_groups.query({ sort: 'sort_order', limit: 100 })),
        withRetry(() => client.entities.modifier_options.query({ sort: 'sort_order', limit: 500 })),
        withRetry(() => client.entities.item_modifier_groups.query({ limit: 500 })),
      ]);
      const extract = (r: PromiseSettledResult<any>) =>
        r.status === 'fulfilled' ? (r.value?.data?.items || []) : [];

      const rawCats = extract(results[0]) as FoodCategory[];
      const rawItems = extract(results[1]) as FoodItem[];
      setCategories(rawCats);
      setItems(
        rawItems.map(it => ({
          ...it,
          is_popular: it.is_popular ?? it.is_recommended,
          is_combo: it.is_combo ?? false,
        }))
      );
      setGroups(extract(results[2]));
      setOptions(extract(results[3]));
      setGroupLinks(extract(results[4]));

      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0 && failedCount < results.length) {
        toast.error('Часть данных не загрузилась. Попробуйте обновить страницу.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  // ─── Categories CRUD ───
  async function saveCat() {
    if (!editingCat?.name) return;
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
    if (!editingItem?.name || !editingItem?.price || !editingItem?.category_id) {
      toast.error('Заполните название, цену и категорию');
      return;
    }
    try {
      const popular = !!(editingItem.is_popular ?? editingItem.is_recommended);
      const combo = !!(editingItem.is_combo);
      if (editingItem.id) {
        const { id, ...rest } = editingItem;
        const updateData = {
          ...rest,
          is_popular: popular,
          is_combo: combo,
          is_recommended: popular,
        };
        await withRetry(() => client.entities.food_items.update({ id: String(id), data: updateData }));
      } else {
        await withRetry(() =>
          client.entities.food_items.create({
            data: {
              ...editingItem,
              is_active: editingItem.is_active !== false,
              is_popular: popular,
              is_combo: combo,
              is_recommended: popular,
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

  async function toggleItemActive(item: FoodItem) {
    try {
      await withRetry(() => client.entities.food_items.update({ id: String(item.id), data: { is_active: !item.is_active } }));
      loadAll();
    } catch { toast.error('Ошибка'); }
  }

  // ─── Modifier Groups CRUD ───
  async function saveGroup() {
    if (!editingGroup?.name) { toast.error('Введите название группы'); return; }
    try {
      const data = {
        name: editingGroup.name,
        type: editingGroup.type || 'checkbox',
        is_required: editingGroup.is_required || false,
        min_select: editingGroup.min_select || 0,
        max_select: editingGroup.max_select || 10,
        sort_order: editingGroup.sort_order || groups.length + 1,
        is_active: editingGroup.is_active !== false,
      };
      if (editingGroup.id) {
        await withRetry(() => client.entities.modifier_groups.update({ id: String(editingGroup.id), data }));
      } else {
        await withRetry(() => client.entities.modifier_groups.create({ data: { ...data, created_at: new Date().toISOString() } }));
      }
      toast.success('Группа модификаторов сохранена');
      invalidateAllCaches();
      setEditingGroup(null);
      loadAll();
    } catch { toast.error('Ошибка сохранения'); }
  }

  async function deleteGroup(id: number) {
    if (!confirm('Удалить группу модификаторов и все её опции?')) return;
    try {
      // Delete all options in this group
      const groupOpts = options.filter(o => o.group_id === id);
      for (const opt of groupOpts) {
        await withRetry(() => client.entities.modifier_options.delete({ id: String(opt.id) }));
      }
      // Delete all links
      const groupLnks = groupLinks.filter(l => l.modifier_group_id === id);
      for (const lnk of groupLnks) {
        await withRetry(() => client.entities.item_modifier_groups.delete({ id: String(lnk.id) }));
      }
      await withRetry(() => client.entities.modifier_groups.delete({ id: String(id) }));
      toast.success('Группа удалена');
      if (expandedGroupId === id) setExpandedGroupId(null);
      loadAll();
    } catch { toast.error('Ошибка удаления'); }
  }

  async function toggleGroupActive(group: ModifierGroup) {
    try {
      await withRetry(() => client.entities.modifier_groups.update({ id: String(group.id), data: { is_active: !group.is_active } }));
      loadAll();
    } catch { toast.error('Ошибка'); }
  }

  // ─── Modifier Options CRUD ───
  async function saveOption() {
    if (!editingOption?.data?.name) { toast.error('Введите название опции'); return; }
    try {
      const data = {
        group_id: editingOption.groupId,
        name: editingOption.data.name,
        price: editingOption.data.price || 0,
        sort_order: editingOption.data.sort_order || options.filter(o => o.group_id === editingOption.groupId).length + 1,
        is_active: editingOption.data.is_active !== false,
      };
      if (editingOption.data.id) {
        await withRetry(() => client.entities.modifier_options.update({ id: String(editingOption.data.id), data }));
      } else {
        await withRetry(() => client.entities.modifier_options.create({ data: { ...data, created_at: new Date().toISOString() } }));
      }
      toast.success('Опция сохранена');
      invalidateAllCaches();
      setEditingOption(null);
      loadAll();
    } catch { toast.error('Ошибка сохранения'); }
  }

  async function deleteOption(id: number) {
    if (!confirm('Удалить опцию?')) return;
    try {
      await withRetry(() => client.entities.modifier_options.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      loadAll();
    } catch { toast.error('Ошибка удаления'); }
  }

  async function toggleOptionActive(opt: ModifierOption) {
    try {
      await withRetry(() => client.entities.modifier_options.update({ id: String(opt.id), data: { is_active: !opt.is_active } }));
      loadAll();
    } catch { toast.error('Ошибка'); }
  }

  // ─── Item-Group Links ───
  async function toggleGroupLink(itemId: number, groupId: number) {
    const existing = groupLinks.find(l => l.food_item_id === itemId && l.modifier_group_id === groupId);
    try {
      if (existing) {
        await withRetry(() => client.entities.item_modifier_groups.delete({ id: String(existing.id) }));
      } else {
        await withRetry(() => client.entities.item_modifier_groups.create({
          data: { food_item_id: itemId, modifier_group_id: groupId, sort_order: groupLinks.filter(l => l.food_item_id === itemId).length + 1, created_at: new Date().toISOString() }
        }));
      }
      loadAll();
    } catch { toast.error('Ошибка'); }
  }

  function getItemGroupIds(itemId: number) {
    return groupLinks.filter(l => l.food_item_id === itemId).map(l => l.modifier_group_id);
  }

  function getGroupOptions(groupId: number) {
    return options.filter(o => o.group_id === groupId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  if (loading) {
    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'items' as Section, label: 'Блюда' },
          { id: 'categories' as Section, label: 'Категории' },
          { id: 'modifier-groups' as Section, label: 'Модификаторы' },
          { id: 'links' as Section, label: 'Привязки' },
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
      </div>

      {/* ─── CATEGORIES ─── */}
      {section === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Категории еды</h3>
            <Button
              size="sm"
              onClick={() =>
                setEditingCat({ name: '', icon: '🍽', slug: '', image: '', sort_order: categories.length + 1 })
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
              <Input
                placeholder="Slug (URL, латиница)"
                value={editingCat.slug || ''}
                onChange={e => setEditingCat({ ...editingCat, slug: e.target.value })}
              />
              <ImageUpload
                value={editingCat.image || ''}
                onChange={key => setEditingCat({ ...editingCat, image: key })}
                folder="food"
                compact
              />
              <Input type="number" placeholder="Порядок" value={editingCat.sort_order || ''} onChange={e => setEditingCat({ ...editingCat, sort_order: parseInt(e.target.value) || 0 })} className="w-32" />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveCat} className="bg-orange-500 hover:bg-orange-600"><Save className="w-4 h-4 mr-1" /> Сохранить</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingCat(null)}><X className="w-4 h-4 mr-1" /> Отмена</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="bg-white rounded-xl border p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <div>
                    <span className="font-medium text-sm">{cat.name}</span>
                    {cat.slug && <span className="text-xs text-gray-500 ml-2 font-mono">{cat.slug}</span>}
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

      {/* ─── ITEMS ─── */}
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
                  description: '',
                  weight: '',
                  is_active: true,
                  is_recommended: false,
                  is_popular: false,
                  is_combo: false,
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
                <select
                  value={editingItem.category_id || ''}
                  onChange={e => setEditingItem({ ...editingItem, category_id: parseInt(e.target.value) })}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Категория *</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <Textarea placeholder="Описание" value={editingItem.description || ''} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} rows={2} />
              <div className="grid grid-cols-3 gap-3">
                <Input type="number" placeholder="Цена *" value={editingItem.price || ''} onChange={e => setEditingItem({ ...editingItem, price: parseInt(e.target.value) || 0 })} />
                <Input placeholder="Вес/порция" value={editingItem.weight || ''} onChange={e => setEditingItem({ ...editingItem, weight: e.target.value })} />
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
                  <input
                    type="checkbox"
                    checked={editingItem.is_popular ?? editingItem.is_recommended ?? false}
                    onChange={e =>
                      setEditingItem({
                        ...editingItem,
                        is_popular: e.target.checked,
                        is_recommended: e.target.checked,
                      })
                    }
                  />
                  Популярное
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editingItem.is_combo || false}
                    onChange={e => setEditingItem({ ...editingItem, is_combo: e.target.checked })}
                  />
                  Комбо
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingItem.is_active !== false} onChange={e => setEditingItem({ ...editingItem, is_active: e.target.checked })} />
                  Активное
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingItem.available_in_park || false} onChange={e => setEditingItem({ ...editingItem, available_in_park: e.target.checked })} />
                  🌳 Доступно в парке
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveItem} className="bg-orange-500 hover:bg-orange-600"><Save className="w-4 h-4 mr-1" /> Сохранить</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}><X className="w-4 h-4 mr-1" /> Отмена</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {items.map(item => {
              const cat = categories.find(c => c.id === item.category_id);
              const linkedGroupCount = groupLinks.filter(l => l.food_item_id === item.id).length;
              return (
                <div key={item.id} className={`bg-white rounded-xl border p-3 flex items-center justify-between ${!item.is_active ? 'opacity-50' : ''}`}>
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
                        {(item.is_popular || item.is_recommended) && (
                          <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px]">Хит</Badge>
                        )}
                        {item.is_combo && <Badge className="bg-violet-100 text-violet-800 border-0 text-[10px]">Комбо</Badge>}
                        {(item as any).available_in_park && <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">🌳 Парк</Badge>}
                        {linkedGroupCount > 0 && <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px]">{linkedGroupCount} групп</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{cat?.name}</span>
                        <span>•</span>
                        <span className="font-semibold text-gray-700">{item.price} ₸</span>
                        {item.weight && <><span>•</span><span>{item.weight}</span></>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => toggleItemActive(item)} className={item.is_active ? 'text-green-600' : 'text-gray-400'}>
                      {item.is_active ? '✓' : '✗'}
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

      {/* ─── MODIFIER GROUPS ─── */}
      {section === 'modifier-groups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">Группы модификаторов</h3>
              <p className="text-xs text-gray-500 mt-0.5">Создайте группы (Размер, Напиток, Соус) и добавьте опции</p>
            </div>
            <Button size="sm" onClick={() => setEditingGroup({ name: '', type: 'checkbox', is_required: false, min_select: 0, max_select: 10, sort_order: groups.length + 1, is_active: true })} className="bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4 mr-1" /> Новая группа
            </Button>
          </div>

          {/* Group edit form */}
          {editingGroup && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm text-orange-800">{editingGroup.id ? 'Редактирование группы' : 'Новая группа'}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Название группы *" value={editingGroup.name || ''} onChange={e => setEditingGroup({ ...editingGroup, name: e.target.value })} />
                <select
                  value={editingGroup.type || 'checkbox'}
                  onChange={e => setEditingGroup({ ...editingGroup, type: e.target.value })}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="radio">Одиночный выбор (radio)</option>
                  <option value="checkbox">Множественный выбор (checkbox)</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Мин. выбор</label>
                  <Input type="number" min={0} value={editingGroup.min_select ?? 0} onChange={e => setEditingGroup({ ...editingGroup, min_select: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Макс. выбор</label>
                  <Input type="number" min={1} value={editingGroup.max_select ?? 10} onChange={e => setEditingGroup({ ...editingGroup, max_select: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Порядок</label>
                  <Input type="number" value={editingGroup.sort_order || ''} onChange={e => setEditingGroup({ ...editingGroup, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingGroup.is_required || false} onChange={e => setEditingGroup({ ...editingGroup, is_required: e.target.checked })} />
                  <span className="font-medium">Обязательный выбор</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingGroup.is_active !== false} onChange={e => setEditingGroup({ ...editingGroup, is_active: e.target.checked })} />
                  Активная
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveGroup} className="bg-orange-500 hover:bg-orange-600"><Save className="w-4 h-4 mr-1" /> Сохранить</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingGroup(null)}><X className="w-4 h-4 mr-1" /> Отмена</Button>
              </div>
            </div>
          )}

          {/* Groups list */}
          <div className="space-y-3">
            {groups.map(group => {
              const isExpanded = expandedGroupId === group.id;
              const groupOpts = getGroupOptions(group.id);
              const linkedItemCount = groupLinks.filter(l => l.modifier_group_id === group.id).length;
              return (
                <div key={group.id} className={`bg-white rounded-xl border overflow-hidden ${!group.is_active ? 'opacity-60' : ''}`}>
                  {/* Group header */}
                  <div className="p-3 flex items-center justify-between">
                    <button onClick={() => setExpandedGroupId(isExpanded ? null : group.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${group.type === 'radio' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                        {group.type === 'radio' ? <CircleDot className="w-4 h-4 text-blue-600" /> : <CheckSquare className="w-4 h-4 text-purple-600" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{group.name}</span>
                          <Badge className={`border-0 text-[10px] ${group.type === 'radio' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {group.type === 'radio' ? 'Один' : 'Несколько'}
                          </Badge>
                          {group.is_required && <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">Обязат.</Badge>}
                          <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px]">{groupOpts.length} опций</Badge>
                          {linkedItemCount > 0 && <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">{linkedItemCount} блюд</Badge>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {group.type === 'checkbox' ? `Выбор: ${group.min_select}–${group.max_select}` : 'Выбор: ровно 1'}
                          {' • '}Порядок: {group.sort_order}
                        </p>
                      </div>
                    </button>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => toggleGroupActive(group)}>
                        {group.is_active ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingGroup(group)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteGroup(group.id)}><Trash2 className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: Options list */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Опции</h4>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setEditingOption({ groupId: group.id, data: { name: '', price: 0, is_active: true } })}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Добавить опцию
                        </Button>
                      </div>

                      {/* Option edit form */}
                      {editingOption && editingOption.groupId === group.id && (
                        <div className="bg-white border border-orange-200 rounded-lg p-3 space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <Input
                              placeholder="Название опции *"
                              value={editingOption.data.name || ''}
                              onChange={e => setEditingOption({ ...editingOption, data: { ...editingOption.data, name: e.target.value } })}
                              className="text-sm h-9"
                            />
                            <Input
                              type="number"
                              placeholder="Цена (₸)"
                              value={editingOption.data.price ?? ''}
                              onChange={e => setEditingOption({ ...editingOption, data: { ...editingOption.data, price: parseInt(e.target.value) || 0 } })}
                              className="text-sm h-9"
                            />
                            <Input
                              type="number"
                              placeholder="Порядок"
                              value={editingOption.data.sort_order || ''}
                              onChange={e => setEditingOption({ ...editingOption, data: { ...editingOption.data, sort_order: parseInt(e.target.value) || 0 } })}
                              className="text-sm h-9"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveOption} className="bg-orange-500 hover:bg-orange-600 h-8 text-xs"><Save className="w-3 h-3 mr-1" /> Сохранить</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingOption(null)} className="h-8 text-xs"><X className="w-3 h-3 mr-1" /> Отмена</Button>
                          </div>
                        </div>
                      )}

                      {/* Options list */}
                      {groupOpts.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">Нет опций. Добавьте первую опцию.</p>
                      ) : (
                        groupOpts.map(opt => (
                          <div key={opt.id} className={`bg-white rounded-lg border p-2.5 flex items-center justify-between ${!opt.is_active ? 'opacity-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                              <span className="text-sm font-medium">{opt.name}</span>
                              {opt.price > 0 && <span className="text-xs text-orange-600 font-semibold">+{opt.price} ₸</span>}
                              {opt.price === 0 && <span className="text-xs text-gray-400">бесплатно</span>}
                            </div>
                            <div className="flex gap-0.5">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleOptionActive(opt)}>
                                {opt.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingOption({ groupId: group.id, data: opt })}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteOption(opt.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {groups.length === 0 && (
              <div className="text-center py-8 bg-white rounded-xl border">
                <Settings2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 font-medium">Нет групп модификаторов</p>
                <p className="text-xs text-gray-400 mt-1">Создайте группу, например «Размер» или «Напиток»</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── LINKS ─── */}
      {section === 'links' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-bold text-lg">Привязка модификаторов к блюдам</h3>
            <p className="text-sm text-gray-500 mt-0.5">Нажмите на блюдо, чтобы выбрать доступные группы модификаторов</p>
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-xl border">
              <Settings2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Сначала создайте группы модификаторов</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setSection('modifier-groups')}>
                Перейти к модификаторам
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => {
                const isOpen = linkItemId === item.id;
                const itemGroupIds = getItemGroupIds(item.id);
                const cat = categories.find(c => c.id === item.category_id);
                return (
                  <div key={item.id} className="bg-white rounded-xl border overflow-hidden">
                    <button
                      onClick={() => setLinkItemId(isOpen ? null : item.id)}
                      className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-sm">
                          {cat?.icon || '🍽'}
                        </div>
                        <div className="text-left">
                          <span className="font-medium text-sm">{item.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{item.price} ₸</span>
                        </div>
                        {itemGroupIds.length > 0 && (
                          <Badge className="bg-purple-50 text-purple-600 border-0 text-[10px]">{itemGroupIds.length} групп</Badge>
                        )}
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-1.5 border-t border-gray-100 pt-2">
                        {groups.map(group => {
                          const isLinked = itemGroupIds.includes(group.id);
                          const optCount = getGroupOptions(group.id).length;
                          return (
                            <button
                              key={group.id}
                              onClick={() => toggleGroupLink(item.id, group.id)}
                              className={`w-full flex items-center justify-between p-3 rounded-xl text-sm transition-all ${
                                isLinked
                                  ? 'bg-purple-50 border-2 border-purple-200'
                                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                  isLinked ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                                }`}>
                                  {isLinked && <span className="text-white text-xs font-bold">✓</span>}
                                </div>
                                <div className="text-left">
                                  <span className={`font-medium ${isLinked ? 'text-purple-700' : 'text-gray-600'}`}>{group.name}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge className={`border-0 text-[9px] ${group.type === 'radio' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                      {group.type === 'radio' ? 'Один' : 'Несколько'}
                                    </Badge>
                                    {group.is_required && <Badge className="bg-red-100 text-red-600 border-0 text-[9px]">Обязат.</Badge>}
                                    <span className="text-[10px] text-gray-400">{optCount} опций</span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}