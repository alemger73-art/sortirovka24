import { useState, useEffect } from 'react';
import { client, withRetry, REAL_ESTATE_TYPES, formatDate, timeAgo } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Eye, Pencil, Check, X, Trash2, Loader2, MapPin, Phone, MessageCircle, Home, Send, EyeOff, Eye as EyeIcon } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';

interface RealEstateItem {
  id: number;
  re_type: string;
  title: string;
  description: string;
  price?: string;
  rooms?: string;
  area?: string;
  floor_info?: string;
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

const RE_TYPE_KEYS = Object.keys(REAL_ESTATE_TYPES);

export default function AdminRealEstate() {
  const [items, setItems] = useState<RealEstateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [viewItem, setViewItem] = useState<RealEstateItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<RealEstateItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filterStatus !== 'all') query.status = filterStatus;
      if (filterType !== 'all') query.re_type = filterType;
      const res = await withRetry(() => client.entities.real_estate.query({ query, sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, [filterStatus, filterType]);

  const changeStatus = async (id: number, status: string) => {
    try {
      await withRetry(() => client.entities.real_estate.update({ id: String(id), data: { status } }));
      const labels: Record<string, string> = { approved: 'Одобрено', rejected: 'Отклонено', hidden: 'Скрыто', pending: 'На модерации' };
      toast.success(labels[status] || 'Статус обновлён');
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem!, status });
    } catch { toast.error('Ошибка обновления'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить объявление?')) return;
    try {
      await withRetry(() => client.entities.real_estate.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error('Ошибка удаления'); }
  };

  const openCreate = () => {
    setEditItem({
      re_type: 'sell_apartment', title: '', description: '', price: '', rooms: '', area: '',
      floor_info: '', address: '', image_url: '', gallery_images: '', phone: '', whatsapp: '',
      telegram: '', author_name: '', active: true, status: 'approved',
    });
    setDialogOpen(true);
  };

  const openEdit = (item: RealEstateItem) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title || !editItem?.phone || !editItem?.re_type) {
      toast.error('Заполните обязательные поля (тип, название и телефон)');
      return;
    }
    setSaving(true);
    try {
      const data = {
        re_type: editItem.re_type || 'sell_apartment',
        title: editItem.title,
        description: editItem.description || '',
        price: editItem.price || '',
        rooms: editItem.rooms || '',
        area: editItem.area || '',
        floor_info: editItem.floor_info || '',
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
        await withRetry(() => client.entities.real_estate.update({ id: String(editItem.id), data }));
        toast.success('Объявление обновлено');
      } else {
        await withRetry(() => client.entities.real_estate.create({
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{items.length} объявлений</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {RE_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{REAL_ESTATE_TYPES[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="pending">На модерации</SelectItem>
              <SelectItem value="approved">Одобренные</SelectItem>
              <SelectItem value="rejected">Отклонённые</SelectItem>
              <SelectItem value="hidden">Скрытые</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1" /> Добавить
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const st = STATUS_MAP[item.status || 'pending'] || STATUS_MAP.pending;
          return (
            <Card key={item.id} className={`overflow-hidden ${item.status === 'hidden' ? 'opacity-60' : ''}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {item.image_url ? (
                      <StorageImage objectKey={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Home className="w-6 h-6 text-emerald-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{REAL_ESTATE_TYPES[item.re_type] || item.re_type}</Badge>
                        <Badge className={`text-xs border ${st.color}`}>{st.label}</Badge>
                      </div>
                      <h3 className="font-medium text-gray-900 text-sm truncate">{item.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        {item.price && <span className="text-emerald-600 font-medium">{item.price}</span>}
                        {item.rooms && <span>🛏 {item.rooms}</span>}
                        {item.area && <span>📐 {item.area} м²</span>}
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
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет объявлений о недвижимости</p>}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Недвижимость #{viewItem?.id}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{REAL_ESTATE_TYPES[viewItem.re_type] || viewItem.re_type}</Badge>
                <Badge className={`border ${(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).color}`}>
                  {(STATUS_MAP[viewItem.status || 'pending'] || STATUS_MAP.pending).label}
                </Badge>
              </div>
              <h3 className="font-semibold text-gray-900">{viewItem.title}</h3>
              {viewItem.price && <p className="text-emerald-600 font-bold text-lg">{viewItem.price}</p>}
              <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                {viewItem.rooms && <span className="bg-gray-100 px-2 py-0.5 rounded">🛏 {viewItem.rooms} комн.</span>}
                {viewItem.area && <span className="bg-gray-100 px-2 py-0.5 rounded">📐 {viewItem.area} м²</span>}
                {viewItem.floor_info && <span className="bg-gray-100 px-2 py-0.5 rounded">🏢 {viewItem.floor_info}</span>}
              </div>
              <p className="text-sm whitespace-pre-wrap">{viewItem.description}</p>
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
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" className={viewItem.status === 'approved' ? 'bg-green-600' : ''} variant={viewItem.status === 'approved' ? 'default' : 'outline'} onClick={() => changeStatus(viewItem.id, 'approved')}>
                    <Check className="h-4 w-4 mr-1" /> Одобрить
                  </Button>
                  <Button size="sm" variant={viewItem.status === 'rejected' ? 'default' : 'outline'} className={viewItem.status === 'rejected' ? 'bg-red-600' : ''} onClick={() => changeStatus(viewItem.id, 'rejected')}>
                    <X className="h-4 w-4 mr-1" /> Отклонить
                  </Button>
                  <Button size="sm" variant={viewItem.status === 'hidden' ? 'default' : 'outline'} className={viewItem.status === 'hidden' ? 'bg-gray-600' : ''} onClick={() => changeStatus(viewItem.id, 'hidden')}>
                    <EyeOff className="h-4 w-4 mr-1" /> Скрыть
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setViewItem(null); openEdit(viewItem); }}>
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
            <DialogTitle>{editItem?.id ? 'Редактировать' : 'Новое объявление о недвижимости'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Тип *</label>
                <Select value={editItem.re_type || 'sell_apartment'} onValueChange={v => setEditItem({ ...editItem, re_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RE_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{REAL_ESTATE_TYPES[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Заголовок *</label>
                <Input value={editItem.title || ''} onChange={e => setEditItem({ ...editItem, title: e.target.value })} placeholder="2-комн. квартира, 55 м²" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={4} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Цена</label>
                  <Input value={editItem.price || ''} onChange={e => setEditItem({ ...editItem, price: e.target.value })} placeholder="15 000 000 ₸" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Комнат</label>
                  <Input value={editItem.rooms || ''} onChange={e => setEditItem({ ...editItem, rooms: e.target.value })} placeholder="2" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Площадь (м²)</label>
                  <Input value={editItem.area || ''} onChange={e => setEditItem({ ...editItem, area: e.target.value })} placeholder="55" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Этаж</label>
                  <Input value={editItem.floor_info || ''} onChange={e => setEditItem({ ...editItem, floor_info: e.target.value })} placeholder="3/9" />
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
                <Input value={editItem.author_name || ''} onChange={e => setEditItem({ ...editItem, author_name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Главное фото</label>
                <ImageUpload value={editItem.image_url || ''} onChange={key => setEditItem({ ...editItem, image_url: key })} folder="real-estate" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Галерея (до 10 фото)</label>
                <MultiImageUpload value={editItem.gallery_images || ''} onChange={keys => setEditItem({ ...editItem, gallery_images: keys })} folder="real-estate-gallery" maxImages={10} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Статус</label>
                <Select value={editItem.status || 'approved'} onValueChange={v => setEditItem({ ...editItem, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">На модерации</SelectItem>
                    <SelectItem value="approved">Одобрено</SelectItem>
                    <SelectItem value="rejected">Отклонено</SelectItem>
                    <SelectItem value="hidden">Скрыто</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">Отмена</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
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