import { useState, useEffect, useMemo } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Plus, Edit2, Trash2, Eye, EyeOff, ChevronRight, ChevronDown,
  FolderTree, List, Save, X, Star, StarOff, GripVertical
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
  slug: string;
  cat_type: string;
  icon: string;
  description: string;
  parent_id: number | null;
  sort_order: number;
  show_on_main: boolean;
  is_active: boolean;
  created_at: string;
}

const CAT_TYPES = [
  { value: 'services', label: 'Услуги' },
  { value: 'real_estate', label: 'Недвижимость' },
  { value: 'announcements', label: 'Объявления' },
  { value: 'jobs', label: 'Работа' },
  { value: 'food', label: 'Еда' },
];

const EMOJI_SUGGESTIONS = ['🔧','⚡','🔥','🪑','🔌','📦','🏠','🪟','✨','🛠️','💇','🧖','🚗','🚿','🏨','🌸','🏢','🔑','🏡','🏘️','🏬','🌿','📢','💰','🛒','🎁','💼','🏪','👨‍🍳','🍽️','🍲','🍖','🥟','🥐','🥤','🚪','💵'];

function slugify(text: string): string {
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
    'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
    'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y',
    'ь':'','э':'e','ю':'yu','я':'ya'
  };
  return text.toLowerCase().split('').map(c => map[c] || c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function CategoryForm({
  category,
  allCategories,
  onSave,
  onCancel
}: {
  category: Partial<Category> | null;
  allCategories: Category[];
  onSave: (data: Partial<Category>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Category>>({
    name: '', slug: '', cat_type: 'services', icon: '🔧',
    description: '', parent_id: null, sort_order: 0,
    show_on_main: false, is_active: true, ...category
  });
  const [autoSlug, setAutoSlug] = useState(!category?.id);

  const rootCategories = allCategories.filter(c => !c.parent_id && c.id !== category?.id);

  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      name,
      ...(autoSlug ? { slug: slugify(name) } : {})
    }));
  };

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{category?.id ? 'Редактировать категорию' : 'Новая категория'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Название *</label>
            <Input value={form.name || ''} onChange={e => handleNameChange(e.target.value)} placeholder="Название категории" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Slug *</label>
            <div className="flex gap-2">
              <Input value={form.slug || ''} onChange={e => { setForm(p => ({ ...p, slug: e.target.value })); setAutoSlug(false); }} placeholder="url-slug" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Тип *</label>
            <select
              value={form.cat_type || 'services'}
              onChange={e => setForm(p => ({ ...p, cat_type: e.target.value }))}
              className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white text-sm"
            >
              {CAT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Родительская категория</label>
            <select
              value={form.parent_id ?? ''}
              onChange={e => setForm(p => ({ ...p, parent_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white text-sm"
            >
              <option value="">— Корневая категория —</option>
              {rootCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Иконка</label>
            <div className="flex gap-2 items-center">
              <Input value={form.icon || ''} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} className="w-20 text-center text-xl" />
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {EMOJI_SUGGESTIONS.map(e => (
                  <button key={e} type="button" onClick={() => setForm(p => ({ ...p, icon: e }))}
                    className={`w-7 h-7 text-sm rounded hover:bg-gray-100 ${form.icon === e ? 'bg-blue-100 ring-1 ring-blue-400' : ''}`}>{e}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Порядок сортировки</label>
            <Input type="number" value={form.sort_order ?? 0} onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Описание</label>
          <Input value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Описание категории" />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300" />
            <span className="text-sm">Активна</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.show_on_main ?? false} onChange={e => setForm(p => ({ ...p, show_on_main: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300" />
            <span className="text-sm">Показывать на главной</span>
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-1" /> Сохранить
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" /> Отмена
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TreeNode({
  category,
  children,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleMain,
  level = 0
}: {
  category: Category;
  children: Category[];
  onEdit: (c: Category) => void;
  onDelete: (id: number) => void;
  onToggleActive: (c: Category) => void;
  onToggleMain: (c: Category) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 group transition-colors ${
          !category.is_active ? 'opacity-50' : ''
        }`}
        style={{ paddingLeft: `${level * 24 + 12}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-gray-200 rounded">
            {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <GripVertical className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100" />
        <span className="text-lg">{category.icon}</span>
        <span className="font-medium text-sm text-gray-900 flex-1">{category.name}</span>
        <span className="text-xs text-gray-400 font-mono">{category.slug}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
          {CAT_TYPES.find(t => t.value === category.cat_type)?.label || category.cat_type}
        </span>
        {category.show_on_main && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Главная</span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onToggleMain(category)} className="p-1 hover:bg-gray-200 rounded" title={category.show_on_main ? 'Убрать с главной' : 'На главную'}>
            {category.show_on_main ? <StarOff className="w-3.5 h-3.5 text-amber-500" /> : <Star className="w-3.5 h-3.5 text-gray-400" />}
          </button>
          <button onClick={() => onToggleActive(category)} className="p-1 hover:bg-gray-200 rounded" title={category.is_active ? 'Скрыть' : 'Показать'}>
            {category.is_active ? <EyeOff className="w-3.5 h-3.5 text-gray-400" /> : <Eye className="w-3.5 h-3.5 text-green-500" />}
          </button>
          <button onClick={() => onEdit(category)} className="p-1 hover:bg-blue-100 rounded" title="Редактировать">
            <Edit2 className="w-3.5 h-3.5 text-blue-500" />
          </button>
          <button onClick={() => onDelete(category.id)} className="p-1 hover:bg-red-100 rounded" title="Удалить">
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {children.map(child => (
            <TreeNode
              key={child.id}
              category={child}
              children={[]}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              onToggleMain={onToggleMain}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [search, setSearch] = useState('');

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.categories.query({ limit: 200, sort: 'sort_order' }));
      setCategories(res?.data?.items || []);
    } catch (e) {
      console.error('Error loading categories:', e);
      toast.error('Ошибка загрузки категорий');
    } finally {
      setLoading(false);
    }
  }

  const tree = useMemo(() => {
    const roots = categories.filter(c => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
    const childrenMap = new Map<number, Category[]>();
    categories.filter(c => c.parent_id).forEach(c => {
      const list = childrenMap.get(c.parent_id!) || [];
      list.push(c);
      childrenMap.set(c.parent_id!, list);
    });
    for (const [, list] of childrenMap) {
      list.sort((a, b) => a.sort_order - b.sort_order);
    }
    return { roots, childrenMap };
  }, [categories]);

  const filteredCategories = useMemo(() => {
    let result = categories;
    if (filterType) result = result.filter(c => c.cat_type === filterType);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(s) || c.slug.includes(s));
    }
    return result;
  }, [categories, filterType, search]);

  async function handleSave(data: Partial<Category>) {
    if (!data.name || !data.slug || !data.cat_type) {
      toast.error('Заполните обязательные поля: название, slug, тип');
      return;
    }
    // Remove null values that the backend doesn't accept (parent_id must be int or omitted)
    const cleanData = (obj: Record<string, any>) => {
      const cleaned: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
          cleaned[key] = value;
        }
      }
      return cleaned;
    };
    try {
      if (data.id) {
        const { id, created_at, ...updateData } = data;
        await withRetry(() => client.entities.categories.update({ id: String(id), data: cleanData(updateData) }));
        toast.success('Категория обновлена');
      } else {
        const { id, ...createData } = data;
        await withRetry(() => client.entities.categories.create({
          data: cleanData({
            ...createData,
            created_at: new Date().toISOString()
          })
        }));
        toast.success('Категория создана');
      }
      setShowForm(false);
      setEditingCategory(null);
      loadCategories();
    } catch (e) {
      console.error('Error saving category:', e);
      toast.error('Ошибка сохранения');
    }
  }

  async function handleDelete(id: number) {
    const children = categories.filter(c => c.parent_id === id);
    if (children.length > 0) {
      toast.error('Сначала удалите подкатегории');
      return;
    }
    if (!confirm('Удалить категорию?')) return;
    try {
      await withRetry(() => client.entities.categories.delete({ id: String(id) }));
      toast.success('Категория удалена');
      invalidateAllCaches();
      loadCategories();
    } catch (e) {
      console.error('Error deleting category:', e);
      toast.error('Ошибка удаления');
    }
  }

  async function handleToggleActive(cat: Category) {
    try {
      await withRetry(() => client.entities.categories.update({ id: String(cat.id), data: { is_active: !cat.is_active } }));
      toast.success(cat.is_active ? 'Категория скрыта' : 'Категория активирована');
      invalidateAllCaches();
      loadCategories();
    } catch (e) {
      toast.error('Ошибка обновления');
    }
  }

  async function handleToggleMain(cat: Category) {
    try {
      await withRetry(() => client.entities.categories.update({ id: String(cat.id), data: { show_on_main: !cat.show_on_main } }));
      toast.success(cat.show_on_main ? 'Убрано с главной' : 'Добавлено на главную');
      invalidateAllCaches();
      loadCategories();
    } catch (e) {
      toast.error('Ошибка обновления');
    }
  }

  function handleEdit(cat: Category) {
    setEditingCategory(cat);
    setShowForm(true);
  }

  function handleAddNew() {
    setEditingCategory(null);
    setShowForm(true);
  }

  function handleAddChild(parentId: number) {
    const parent = categories.find(c => c.id === parentId);
    setEditingCategory({
      parent_id: parentId,
      cat_type: parent?.cat_type || 'services',
      sort_order: (categories.filter(c => c.parent_id === parentId).length + 1),
      is_active: true,
      show_on_main: false,
    });
    setShowForm(true);
  }

  const stats = useMemo(() => {
    const roots = categories.filter(c => !c.parent_id);
    const subs = categories.filter(c => c.parent_id);
    const active = categories.filter(c => c.is_active);
    const onMain = categories.filter(c => c.show_on_main);
    return { total: categories.length, roots: roots.length, subs: subs.length, active: active.length, onMain: onMain.length };
  }, [categories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3"><div className="text-2xl font-bold text-blue-600">{stats.total}</div><div className="text-xs text-gray-500">Всего</div></Card>
        <Card className="p-3"><div className="text-2xl font-bold text-indigo-600">{stats.roots}</div><div className="text-xs text-gray-500">Корневых</div></Card>
        <Card className="p-3"><div className="text-2xl font-bold text-purple-600">{stats.subs}</div><div className="text-xs text-gray-500">Подкатегорий</div></Card>
        <Card className="p-3"><div className="text-2xl font-bold text-green-600">{stats.active}</div><div className="text-xs text-gray-500">Активных</div></Card>
        <Card className="p-3"><div className="text-2xl font-bold text-amber-600">{stats.onMain}</div><div className="text-xs text-gray-500">На главной</div></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleAddNew} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Новая категория
        </Button>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setViewMode('tree')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'tree' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
            <FolderTree className="w-4 h-4 inline mr-1" /> Дерево
          </button>
          <button onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
            <List className="w-4 h-4 inline mr-1" /> Список
          </button>
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="h-9 px-3 rounded-md border border-gray-200 bg-white text-sm">
          <option value="">Все типы</option>
          {CAT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." className="w-48" />
      </div>

      {/* Form */}
      {showForm && (
        <CategoryForm
          category={editingCategory}
          allCategories={categories}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingCategory(null); }}
        />
      )}

      {/* Tree View */}
      {viewMode === 'tree' && (
        <Card>
          <CardContent className="p-2">
            {(filterType || search ? filteredCategories.filter(c => !c.parent_id) : tree.roots).map(root => {
              const children = filterType || search
                ? filteredCategories.filter(c => c.parent_id === root.id)
                : (tree.childrenMap.get(root.id) || []);
              return (
                <div key={root.id} className="mb-1">
                  <TreeNode
                    category={root}
                    children={children}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                    onToggleMain={handleToggleMain}
                  />
                  <div style={{ paddingLeft: '48px' }}>
                    <button
                      onClick={() => handleAddChild(root.id)}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 py-1 px-2 rounded hover:bg-blue-50 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Добавить подкатегорию
                    </button>
                  </div>
                </div>
              );
            })}
            {categories.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <FolderTree className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Категории не найдены</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Иконка</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Название</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Slug</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Тип</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Родитель</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Порядок</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Статус</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCategories.map(cat => {
                    const parent = categories.find(c => c.id === cat.parent_id);
                    return (
                      <tr key={cat.id} className={`hover:bg-gray-50 ${!cat.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 text-lg">{cat.icon}</td>
                        <td className="px-4 py-3 font-medium">{cat.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{cat.slug}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{CAT_TYPES.find(t => t.value === cat.cat_type)?.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{parent ? `${parent.icon} ${parent.name}` : '—'}</td>
                        <td className="px-4 py-3 text-center">{cat.sort_order}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {cat.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Активна</span>}
                            {!cat.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Скрыта</span>}
                            {cat.show_on_main && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Главная</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => handleToggleActive(cat)} className="p-1.5 hover:bg-gray-100 rounded" title={cat.is_active ? 'Скрыть' : 'Показать'}>
                              {cat.is_active ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-green-500" />}
                            </button>
                            <button onClick={() => handleEdit(cat)} className="p-1.5 hover:bg-blue-50 rounded">
                              <Edit2 className="w-4 h-4 text-blue-500" />
                            </button>
                            <button onClick={() => handleDelete(cat.id)} className="p-1.5 hover:bg-red-50 rounded">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}