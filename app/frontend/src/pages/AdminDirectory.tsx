import { useState, useEffect, useMemo } from 'react';
import { client, withRetry, DIRECTORY_CATEGORIES, sortDirectoryEntries } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface DirectoryEntry {
  id: number;
  entry_name: string;
  category: string;
  address?: string;
  phone: string;
  description?: string;
  sort_order?: number | null;
  created_at?: string;
}

function nextSortOrder(items: DirectoryEntry[], category: string): number {
  const inCat = items.filter(i => i.category === category);
  const max = inCat.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
  return max + 1;
}

export default function AdminDirectory() {
  const [items, setItems] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<DirectoryEntry> | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filterCategory) query.category = filterCategory;
      const res = await withRetry(() => client.entities.directory_entries.query({
        query: filterCategory ? query : undefined,
        sort: 'sort_order',
        limit: 200,
      }));
      setItems(sortDirectoryEntries(res.data?.items || []));
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, [filterCategory]);

  const grouped = useMemo(() => {
    const acc: Record<string, DirectoryEntry[]> = {};
    for (const item of items) {
      const cat = item.category || 'Без категории';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
    }
    return DIRECTORY_CATEGORIES
      .filter(cat => acc[cat]?.length)
      .map(cat => [cat, acc[cat]] as [string, DirectoryEntry[]]);
  }, [items]);

  const openCreate = () => {
    const category = filterCategory || DIRECTORY_CATEGORIES[0];
    setEditItem({
      entry_name: '',
      category,
      address: '',
      phone: '',
      description: '',
      sort_order: nextSortOrder(items, category),
    });
    setDialogOpen(true);
  };

  const openEdit = (item: DirectoryEntry) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.entry_name || !editItem?.phone || !editItem?.category) {
      toast.error('Заполните обязательные поля');
      return;
    }
    setSaving(true);
    try {
      const data = {
        entry_name: editItem.entry_name,
        category: editItem.category,
        address: editItem.address || '',
        phone: editItem.phone,
        description: editItem.description || '',
        sort_order: editItem.sort_order ?? nextSortOrder(items, editItem.category),
      };
      if (editItem.id) {
        await withRetry(() => client.entities.directory_entries.update({ id: String(editItem.id), data }));
        toast.success('Запись обновлена');
      } else {
        await withRetry(() => client.entities.directory_entries.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) },
        }));
        toast.success('Запись создана');
      }
      invalidateAllCaches();
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить запись?')) return;
    try {
      await withRetry(() => client.entities.directory_entries.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error('Ошибка удаления'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">{items.length} записей</p>
        <div className="flex items-center gap-2">
          <Select value={filterCategory || 'all'} onValueChange={v => setFilterCategory(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Все категории" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              {DIRECTORY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-1" /> Добавить
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-center text-gray-400 py-8">Нет записей</p>
      ) : (
        grouped.map(([cat, catItems]) => (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{cat}</p>
            {catItems.map(item => (
              <Card key={item.id}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">#{item.sort_order ?? '—'}</Badge>
                        <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                      </div>
                      <p className="font-medium text-sm text-gray-900">{item.entry_name}</p>
                      {item.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
                        {item.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.address}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Редактировать запись' : 'Новая запись'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Название *</label>
                <Input value={editItem.entry_name || ''} onChange={e => setEditItem({ ...editItem, entry_name: e.target.value })} placeholder="Название организации" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Категория *</label>
                  <Select
                    value={editItem.category || ''}
                    onValueChange={v => setEditItem({
                      ...editItem,
                      category: v,
                      sort_order: editItem.id ? editItem.sort_order : nextSortOrder(items, v),
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIRECTORY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Порядок</label>
                  <Input
                    type="number"
                    min={0}
                    value={editItem.sort_order ?? ''}
                    onChange={e => setEditItem({ ...editItem, sort_order: e.target.value ? parseInt(e.target.value) : 0 })}
                    placeholder="1"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Адрес</label>
                <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} placeholder="Адрес" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Телефон *</label>
                <Input value={editItem.phone || ''} onChange={e => setEditItem({ ...editItem, phone: e.target.value })} placeholder="+7... или 102" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={3} placeholder="Краткое описание" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">Отмена</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editItem.id ? 'Сохранить' : 'Создать'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
