import { useState, useEffect } from 'react';
import { client, withRetry, DIRECTORY_CATEGORIES, formatDate } from '@/lib/api';
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
  created_at?: string;
}

export default function AdminDirectory() {
  const [items, setItems] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<DirectoryEntry> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.directory_entries.query({ sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const openCreate = () => {
    setEditItem({ entry_name: '', category: DIRECTORY_CATEGORIES[0], address: '', phone: '', description: '' });
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
      };
      if (editItem.id) {
        await withRetry(() => client.entities.directory_entries.update({ id: String(editItem.id), data }));
        toast.success('Запись обновлена');
      } else {
        await withRetry(() => client.entities.directory_entries.create({ data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) } }));
        toast.success('Запись создана');
        invalidateAllCaches();
      }
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} записей</p>
        <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1" /> Добавить
        </Button>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{item.category}</Badge>
                  </div>
                  <p className="font-medium text-sm text-gray-900">{item.entry_name}</p>
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
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет записей</p>}
      </div>

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
              <div>
                <label className="text-sm font-medium text-gray-700">Категория *</label>
                <Select value={editItem.category || ''} onValueChange={v => setEditItem({ ...editItem, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIRECTORY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Адрес</label>
                <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} placeholder="Адрес" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Телефон *</label>
                <Input value={editItem.phone || ''} onChange={e => setEditItem({ ...editItem, phone: e.target.value })} placeholder="+7..." />
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