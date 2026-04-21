import { useState, useEffect } from 'react';
import { client, withRetry, ANN_TYPES, formatDate, timeAgo } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Eye, Pencil, Check, X, Trash2, Loader2, MapPin, Phone, MessageCircle, Send, EyeOff, Eye as EyeIcon } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';

interface Announcement {
  id: number;
  ann_type: string;
  title: string;
  description: string;
  price?: string;
  address?: string;
  image_url?: string;
  gallery_images?: string;
  phone: string;
  whatsapp?: string;
  telegram?: string;
  author_name?: string;
  active?: boolean;
  status?: string;
  created_at?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'На модерации', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Одобрено', color: 'bg-green-100 text-green-800 border-green-200' },
  published: { label: 'Опубликовано', color: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Отклонено', color: 'bg-red-100 text-red-800 border-red-200' },
  hidden: { label: 'Скрыто', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const ANN_TYPE_KEYS = Object.keys(ANN_TYPES);

export default function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewItem, setViewItem] = useState<Announcement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Announcement> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filterStatus !== 'all') query.status = filterStatus;
      const res = await withRetry(() => client.entities.announcements.query({ query, sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, [filterStatus]);

  const changeStatus = async (id: number, status: string) => {
    try {
      await withRetry(() => client.entities.announcements.update({ id: String(id), data: { status } }));
      toast.success(status === 'approved' ? 'Объявление одобрено' : status === 'rejected' ? 'Объявление отклонено' : 'Статус обновлён');
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem!, status });
    } catch { toast.error('Ошибка обновления'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить объявление?')) return;
    try {
      await withRetry(() => client.entities.announcements.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error('Ошибка удаления'); }
  };

  const openCreate = () => {
    setEditItem({
      ann_type: 'sell', title: '', description: '', price: '', address: '',
      image_url: '', gallery_images: '', phone: '', whatsapp: '', telegram: '',
      author_name: '', active: true, status: 'approved',
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Announcement) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title || !editItem?.phone) {
      toast.error('Заполните обязательные поля (название и телефон)');
      return;
    }
    setSaving(true);
    try {
      const data = {
        ann_type: editItem.ann_type || 'sell',
        title: editItem.title,
        description: editItem.description || '',
        price: editItem.price || '',
        address: editItem.address || '',
        image_url: editItem.image_url || '',
        gallery_images: editItem.gallery_images || '',
        phone: editItem.phone,
        whatsapp: editItem.whatsapp || '',
        telegram: editItem.telegram || '',
        author_name: editItem.author_name || '',
        active: editItem.active ?? true,
        status: editItem.status || 'approved',
      };
      if (editItem.id) {
        await withRetry(() => client.entities.announcements.update({ id: String(editItem.id), data }));
        toast.success('Объявление обновлено');
      } else {
        await withRetry(() => client.entities.announcements.create({
          data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }
        }));
        toast.success('Объявление создано');
        invalidateAllCaches();
      }
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{items.length} объявлений</p>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="pending">На модерации</SelectItem>
              <SelectItem value="approved">Одобренные</SelectItem>
              <SelectItem value="published">Опубликованные</SelectItem>
              <SelectItem value="rejected">Отклонённые</SelectItem>
              <SelectItem value="hidden">Скрытые</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-1" /> Добавить
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const st = STATUS_MAP[item.status || 'pending'] || STATUS_MAP.pending;
          return (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {item.image_url && (
                      <StorageImage objectKey={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{ANN_TYPES[item.ann_type] || item.ann_type}</Badge>
                        <Badge className={`text-xs border ${st.color}`}>{st.label}</Badge>
                      </div>
                      <h3 className="font-medium text-gray-900 text-sm truncate">{item.title}</h3>
                      <p className="text-xs text-gray-500 line-clamp-1">{item.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {item.author_name && <span>{item.author_name}</span>}
                        <span>{item.phone}</span>
                        {item.created_at && <span>{timeAgo(item.created_at)}</span>}
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
                    {item.status !== 'approved' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'approved')}>
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {item.status !== 'hidden' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'hidden')} title="Скрыть">
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      </Button>
                    )}
                    {item.status === 'hidden' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'approved')} title="Показать">
                        <EyeIcon className="h-4 w-4 text-green-500" />
                      </Button>
                    )}
                    {item.status !== 'rejected' && item.status !== 'hidden' && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => changeStatus(item.id, 'rejected')}>
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет объявлений</p>}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Объявление #{viewItem?.id}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{ANN_TYPES[viewItem.ann_type] || viewItem.ann_type}</Badge>
                <Badge className={`border ${(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).color}`}>
                  {(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).label}
                </Badge>
              </div>
              <h3 className="font-semibold text-gray-900">{viewItem.title}</h3>
              <p className="text-sm whitespace-pre-wrap">{viewItem.description}</p>
              {viewItem.price && <p className="text-blue-600 font-bold">{viewItem.price}</p>}
              <div className="space-y-1 text-sm text-gray-600">
                {viewItem.address && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{viewItem.address}</p>}
                <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{viewItem.phone}</p>
                {viewItem.whatsapp && <p className="flex items-center gap-2"><MessageCircle className="h-4 w-4" />{viewItem.whatsapp}</p>}
                {viewItem.telegram && <p className="flex items-center gap-2"><Send className="h-4 w-4" />{viewItem.telegram}</p>}
                {viewItem.author_name && <p>Автор: {viewItem.author_name}</p>}
              </div>
              {viewItem.image_url && (
                <StorageImage objectKey={viewItem.image_url} alt="" className="w-full rounded-lg max-h-48 object-cover" />
              )}
              {viewItem.gallery_images && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Галерея:</p>
                  <StorageGallery keys={viewItem.gallery_images} />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Действия:</label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className={viewItem.status === 'approved' ? 'bg-green-600' : ''}
                    variant={viewItem.status === 'approved' ? 'default' : 'outline'}
                    onClick={() => changeStatus(viewItem.id, 'approved')}
                  >
                    <Check className="h-4 w-4 mr-1" /> Одобрить
                  </Button>
                  <Button
                    size="sm"
                    variant={viewItem.status === 'rejected' ? 'default' : 'outline'}
                    className={viewItem.status === 'rejected' ? 'bg-red-600' : ''}
                    onClick={() => changeStatus(viewItem.id, 'rejected')}
                  >
                    <X className="h-4 w-4 mr-1" /> Отклонить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setViewItem(null); openEdit(viewItem); }}
                  >
                    <Pencil className="h-4 w-4 mr-1" /> Редактировать
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Редактировать объявление' : 'Новое объявление'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Тип *</label>
                <Select value={editItem.ann_type || 'sell'} onValueChange={v => setEditItem({ ...editItem, ann_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANN_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{ANN_TYPES[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Название *</label>
                <Input value={editItem.title || ''} onChange={e => setEditItem({ ...editItem, title: e.target.value })} placeholder="Название объявления" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={4} placeholder="Подробное описание..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Цена</label>
                  <Input value={editItem.price || ''} onChange={e => setEditItem({ ...editItem, price: e.target.value })} placeholder="50 000 ₸" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Адрес</label>
                  <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} placeholder="ул. Ленина 5" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Телефон *</label>
                  <Input value={editItem.phone || ''} onChange={e => setEditItem({ ...editItem, phone: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">WhatsApp</label>
                  <Input value={editItem.whatsapp || ''} onChange={e => setEditItem({ ...editItem, whatsapp: e.target.value })} placeholder="+7..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Telegram</label>
                  <Input value={editItem.telegram || ''} onChange={e => setEditItem({ ...editItem, telegram: e.target.value })} placeholder="@username" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Автор</label>
                <Input value={editItem.author_name || ''} onChange={e => setEditItem({ ...editItem, author_name: e.target.value })} placeholder="Имя автора" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Главное фото</label>
                <ImageUpload
                  value={editItem.image_url || ''}
                  onChange={(key) => setEditItem({ ...editItem, image_url: key })}
                  folder="announcements"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Галерея (до 10 фото)</label>
                <MultiImageUpload
                  value={editItem.gallery_images || ''}
                  onChange={(keys) => setEditItem({ ...editItem, gallery_images: keys })}
                  folder="announcements-gallery"
                  maxImages={10}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Статус</label>
                <Select value={editItem.status || 'approved'} onValueChange={v => setEditItem({ ...editItem, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">На модерации</SelectItem>
                    <SelectItem value="approved">Одобрено</SelectItem>
                    <SelectItem value="published">Опубликовано</SelectItem>
                    <SelectItem value="rejected">Отклонено</SelectItem>
                    <SelectItem value="hidden">Скрыто</SelectItem>
                  </SelectContent>
                </Select>
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