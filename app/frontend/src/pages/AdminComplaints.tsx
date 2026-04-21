import { useState, useEffect } from 'react';
import { client, withRetry, COMPLAINT_CATEGORIES, formatDate } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Eye, Pencil, Trash2, Loader2, MapPin, Phone, User, Images } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';
import StorageVideo from '@/components/StorageVideo';

interface Complaint {
  id: number;
  category: string;
  address: string;
  description: string;
  photo_url?: string;
  gallery_images?: string;
  complaint_video?: string;
  author_name?: string;
  phone?: string;
  status: string;
  created_at?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новая', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  in_progress: { label: 'В работе', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  resolved: { label: 'Решено', color: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Отклонено', color: 'bg-red-100 text-red-800 border-red-200' },
  hidden: { label: 'Скрыта', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default function AdminComplaints() {
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewItem, setViewItem] = useState<Complaint | null>(null);
  const [editItem, setEditItem] = useState<Partial<Complaint> | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filterStatus !== 'all') query.status = filterStatus;
      const res = await withRetry(() => client.entities.complaints.query({ query, sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, [filterStatus]);

  const changeStatus = async (id: number, status: string) => {
    try {
      await withRetry(() => client.entities.complaints.update({ id: String(id), data: { status } }));
      toast.success('Статус обновлён');
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem!, status });
    } catch { toast.error('Ошибка обновления'); }
  };

  const openEdit = (item: Complaint) => {
    setEditItem({ ...item });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem?.id) return;
    setSaving(true);
    try {
      await withRetry(() => client.entities.complaints.update({
        id: String(editItem.id),
        data: {
          category: editItem.category,
          address: editItem.address,
          description: editItem.description,
          photo_url: editItem.photo_url || '',
          gallery_images: editItem.gallery_images || '',
          status: editItem.status,
          author_name: editItem.author_name || '',
          phone: editItem.phone || '',
        }
      }));
      toast.success('Жалоба обновлена');
      invalidateAllCaches();
      setEditOpen(false);
      fetchItems();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить жалобу?')) return;
    try {
      await withRetry(() => client.entities.complaints.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error('Ошибка удаления'); }
  };

  const getGalleryCount = (item: Complaint) => {
    if (!item.gallery_images) return 0;
    return item.gallery_images.split(',').filter(k => k.trim()).length;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{items.length} жалоб</p>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="new">Новые</SelectItem>
            <SelectItem value="in_progress">В работе</SelectItem>
            <SelectItem value="resolved">Решено</SelectItem>
            <SelectItem value="rejected">Отклонено</SelectItem>
            <SelectItem value="hidden">Скрытые</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const st = STATUS_MAP[item.status] || STATUS_MAP.new;
          return (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {item.photo_url && (
                      <StorageImage objectKey={item.photo_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{item.category}</Badge>
                        <Badge className={`text-xs border ${st.color}`}>{st.label}</Badge>
                        {getGalleryCount(item) > 0 && <Badge variant="secondary" className="text-xs"><Images className="h-3 w-3 mr-1" />{getGalleryCount(item)} фото</Badge>}
                      </div>
                      <p className="text-sm text-gray-900 line-clamp-2">{item.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.address}</span>
                        {item.created_at && <span>{formatDate(item.created_at)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewItem(item)}>
                      <Eye className="h-4 w-4 text-gray-500" />
                    </Button>
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
          );
        })}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет жалоб</p>}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Жалоба #{viewItem?.id}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{viewItem.category}</Badge>
                <Badge className={`border ${(STATUS_MAP[viewItem.status] || STATUS_MAP.new).color}`}>
                  {(STATUS_MAP[viewItem.status] || STATUS_MAP.new).label}
                </Badge>
              </div>
              <p className="text-sm whitespace-pre-wrap">{viewItem.description}</p>
              <div className="space-y-1 text-sm text-gray-600">
                <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{viewItem.address}</p>
                {viewItem.author_name && <p className="flex items-center gap-2"><User className="h-4 w-4" />{viewItem.author_name}</p>}
                {viewItem.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{viewItem.phone}</p>}
              </div>
              {viewItem.photo_url && (
                <StorageImage objectKey={viewItem.photo_url} alt="" className="w-full rounded-lg max-h-48 object-cover" />
              )}
              {viewItem.gallery_images && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Дополнительные фото:</p>
                  <StorageGallery keys={viewItem.gallery_images} />
                </div>
              )}
              {viewItem.complaint_video && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Видео:</p>
                  <StorageVideo objectKey={viewItem.complaint_video} />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Изменить статус:</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_MAP).map(([key, val]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={viewItem.status === key ? 'default' : 'outline'}
                      className={viewItem.status === key ? 'bg-blue-600' : ''}
                      onClick={() => changeStatus(viewItem.id, key)}
                    >
                      {val.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Редактировать жалобу</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Категория</label>
                <Select value={editItem.category || ''} onValueChange={v => setEditItem({ ...editItem, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPLAINT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Адрес</label>
                <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={4} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Основное фото</label>
                <ImageUpload
                  value={editItem.photo_url || ''}
                  onChange={(key) => setEditItem({ ...editItem, photo_url: key })}
                  folder="complaints"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Дополнительные фото</label>
                <p className="text-xs text-gray-400 mb-1">Загрузите несколько фото. Перетаскивайте для изменения порядка.</p>
                <MultiImageUpload
                  value={editItem.gallery_images || ''}
                  onChange={(keys) => setEditItem({ ...editItem, gallery_images: keys })}
                  folder="complaints"
                  maxImages={8}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Статус</label>
                <Select value={editItem.status || 'new'} onValueChange={v => setEditItem({ ...editItem, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP).map(([k, val]) => <SelectItem key={k} value={k}>{val.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setEditOpen(false)} variant="outline" className="flex-1">Отмена</Button>
                <Button onClick={handleSaveEdit} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Сохранить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}