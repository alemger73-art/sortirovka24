import { useState, useEffect } from 'react';
import { client, withRetry, MASTER_CATEGORIES, formatDate } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Eye, Loader2, Phone, MapPin, Check, X, UserPlus, Star, Send, Images } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload, { StorageGallery } from '@/components/MultiImageUpload';

interface MasterRequest {
  id: number; category: string; problem_description: string; address: string;
  phone: string; client_name?: string; status: string; created_at?: string;
}

interface BecomeMasterReq {
  id: number; name: string; category: string; phone: string; whatsapp?: string;
  district?: string; description?: string; status: string; created_at?: string;
}

interface Master {
  id: number; name: string; category: string; phone: string; whatsapp?: string;
  telegram?: string; district?: string; description?: string; rating?: number;
  reviews_count?: number; photo_url?: string; gallery_images?: string;
  verified?: boolean; available_today?: boolean;
  services?: string; experience_years?: number; created_at?: string;
}

// ============ MASTER REQUESTS SECTION ============
function MasterRequestsSection() {
  const [items, setItems] = useState<MasterRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewItem, setViewItem] = useState<MasterRequest | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.master_requests.query({ sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    new: { label: 'Новая', color: 'bg-yellow-100 text-yellow-800' },
    in_progress: { label: 'В работе', color: 'bg-blue-100 text-blue-800' },
    done: { label: 'Выполнено', color: 'bg-green-100 text-green-800' },
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{items.length} заявок на мастера</p>
      <div className="space-y-2">
        {items.map(item => {
          const st = STATUS_MAP[item.status] || STATUS_MAP.new;
          return (
            <Card key={item.id}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                    </div>
                    <p className="text-sm text-gray-900 line-clamp-2">{item.problem_description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      {item.client_name && <span>{item.client_name}</span>}
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.address}</span>
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
                    </div>
                    {item.created_at && <p className="text-xs text-gray-400 mt-1">{formatDate(item.created_at)}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewItem(item)}>
                    <Eye className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет заявок</p>}
      </div>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Заявка #{viewItem?.id}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-2 text-sm">
              <p><strong>Категория:</strong> {viewItem.category}</p>
              <p><strong>Описание:</strong> {viewItem.problem_description}</p>
              <p><strong>Адрес:</strong> {viewItem.address}</p>
              <p><strong>Клиент:</strong> {viewItem.client_name || '—'}</p>
              <p><strong>Телефон:</strong> {viewItem.phone}</p>
              <p><strong>Статус:</strong> {(STATUS_MAP[viewItem.status] || STATUS_MAP.new).label}</p>
              <p><strong>Дата:</strong> {viewItem.created_at ? formatDate(viewItem.created_at) : '—'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ BECOME MASTER SECTION ============
function BecomeMasterSection() {
  const [items, setItems] = useState<BecomeMasterReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewItem, setViewItem] = useState<BecomeMasterReq | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.become_master_requests.query({ sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      await withRetry(() => client.entities.become_master_requests.update({ id: String(id), data: { status } }));
      toast.success(status === 'approved' ? 'Одобрено' : 'Отклонено');
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem!, status });
    } catch { toast.error('Ошибка'); }
  };

  const approveAndCreateMaster = async (item: BecomeMasterReq) => {
    setProcessing(true);
    try {
      await withRetry(() => client.entities.become_master_requests.update({ id: String(item.id), data: { status: 'approved' } }));
      await withRetry(() => client.entities.masters.create({
        data: {
          name: item.name,
          category: item.category,
          phone: item.phone,
          whatsapp: item.whatsapp || '',
          telegram: '',
          district: item.district || '',
          description: item.description || '',
          rating: 5,
          reviews_count: 0,
          photo_url: '',
          gallery_images: '',
          verified: true,
          available_today: true,
          services: item.category,
          experience_years: 1,
          created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        }
      }));
      toast.success('Мастер одобрен и добавлен в каталог!');
      invalidateAllCaches();
      fetchItems();
      setViewItem(null);
    } catch { toast.error('Ошибка создания мастера'); }
    finally { setProcessing(false); }
  };

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    pending: { label: 'На рассмотрении', color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Одобрено', color: 'bg-green-100 text-green-800' },
    rejected: { label: 'Отклонено', color: 'bg-red-100 text-red-800' },
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{items.length} заявок</p>
      <div className="space-y-2">
        {items.map(item => {
          const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
          return (
            <Card key={item.id}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                    </div>
                    <p className="font-medium text-sm text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewItem(item)}>
                      <Eye className="h-4 w-4 text-gray-500" />
                    </Button>
                    {item.status === 'pending' && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => updateStatus(item.id, 'approved')}>
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => updateStatus(item.id, 'rejected')}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет заявок</p>}
      </div>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Заявка от {viewItem?.name}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="space-y-2 text-sm">
                <p><strong>Имя:</strong> {viewItem.name}</p>
                <p><strong>Категория:</strong> {viewItem.category}</p>
                <p><strong>Телефон:</strong> {viewItem.phone}</p>
                {viewItem.whatsapp && <p><strong>WhatsApp:</strong> {viewItem.whatsapp}</p>}
                {viewItem.district && <p><strong>Район:</strong> {viewItem.district}</p>}
                {viewItem.description && <p><strong>О себе:</strong> {viewItem.description}</p>}
                <p><strong>Статус:</strong> {(STATUS_MAP[viewItem.status] || STATUS_MAP.pending).label}</p>
              </div>
              {viewItem.status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => updateStatus(viewItem.id, 'rejected')} variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50">
                    <X className="h-4 w-4 mr-1" /> Отклонить
                  </Button>
                  <Button onClick={() => approveAndCreateMaster(viewItem)} disabled={processing} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                    {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                    Одобрить и добавить
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ MASTERS CATALOG SECTION ============
function MastersCatalogSection() {
  const [items, setItems] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Master> | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewItem, setViewItem] = useState<Master | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.masters.query({ sort: '-created_at', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const openCreate = () => {
    setEditItem({
      name: '', category: MASTER_CATEGORIES[0], phone: '', whatsapp: '', telegram: '',
      district: 'Сортировка', description: '', rating: 5, reviews_count: 0,
      photo_url: '', gallery_images: '', verified: false, available_today: true, services: '', experience_years: 1,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Master) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.name || !editItem?.phone || !editItem?.category) {
      toast.error('Заполните обязательные поля');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: editItem.name,
        category: editItem.category,
        phone: editItem.phone,
        whatsapp: editItem.whatsapp || '',
        telegram: editItem.telegram || '',
        district: editItem.district || '',
        description: editItem.description || '',
        rating: editItem.rating ?? 5,
        reviews_count: editItem.reviews_count ?? 0,
        photo_url: editItem.photo_url || '',
        gallery_images: editItem.gallery_images || '',
        verified: editItem.verified ?? false,
        available_today: editItem.available_today ?? true,
        services: editItem.services || '',
        experience_years: editItem.experience_years ?? 1,
      };
      if (editItem.id) {
        await withRetry(() => client.entities.masters.update({ id: String(editItem.id), data }));
        toast.success('Мастер обновлён');
      } else {
        await withRetry(() => client.entities.masters.create({ data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) } }));
        toast.success('Мастер создан');
        invalidateAllCaches();
      }
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить мастера?')) return;
    try {
      await withRetry(() => client.entities.masters.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error('Ошибка удаления'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} мастеров</p>
        <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1" /> Добавить мастера
        </Button>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {item.photo_url ? (
                    <StorageImage objectKey={item.photo_url} alt={item.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 font-bold text-lg">
                      {item.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      {item.verified && <Badge className="text-xs bg-green-100 text-green-800">✓ Проверен</Badge>}
                      {item.available_today && <Badge className="text-xs bg-blue-100 text-blue-800">Выезд сегодня</Badge>}
                      {item.gallery_images && (
                        <Badge className="text-xs bg-purple-100 text-purple-800">
                          <Images className="h-3 w-3 mr-0.5" />
                          {item.gallery_images.split(',').filter(Boolean).length} фото
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm text-gray-900">{item.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
                      {item.telegram && <span className="flex items-center gap-1"><Send className="h-3 w-3" />{item.telegram}</span>}
                      {item.district && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.district}</span>}
                      {item.rating && <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500" />{item.rating}</span>}
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
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Нет мастеров</p>}
      </div>

      {/* View Dialog with Gallery */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Мастер: {viewItem?.name}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {viewItem.photo_url ? (
                  <StorageImage objectKey={viewItem.photo_url} alt={viewItem.name} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl">
                    {viewItem.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{viewItem.name}</h3>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <Badge variant="outline">{viewItem.category}</Badge>
                    {viewItem.verified && <Badge className="bg-green-100 text-green-800">✓ Проверен</Badge>}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <p><strong>Телефон:</strong> {viewItem.phone}</p>
                {viewItem.whatsapp && <p><strong>WhatsApp:</strong> {viewItem.whatsapp}</p>}
                {viewItem.telegram && <p><strong>Telegram:</strong> {viewItem.telegram}</p>}
                {viewItem.district && <p><strong>Район:</strong> {viewItem.district}</p>}
                {viewItem.description && <p><strong>Описание:</strong> {viewItem.description}</p>}
                {viewItem.services && <p><strong>Услуги:</strong> {viewItem.services}</p>}
                <p><strong>Рейтинг:</strong> ⭐ {viewItem.rating} ({viewItem.reviews_count} отзывов)</p>
                <p><strong>Опыт:</strong> {viewItem.experience_years} лет</p>
                <p><strong>Выезд сегодня:</strong> {viewItem.available_today ? 'Да' : 'Нет'}</p>
              </div>
              {viewItem.gallery_images && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">📸 Галерея работ:</p>
                  <StorageGallery keys={viewItem.gallery_images} />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button onClick={() => { setViewItem(null); openEdit(viewItem); }} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <Pencil className="h-4 w-4 mr-1" /> Редактировать
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Редактировать мастера' : 'Новый мастер'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Фото мастера</label>
                <ImageUpload
                  value={editItem.photo_url || ''}
                  onChange={(key) => setEditItem({ ...editItem, photo_url: key })}
                  folder="masters"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Имя *</label>
                <Input value={editItem.name || ''} onChange={e => setEditItem({ ...editItem, name: e.target.value })} placeholder="Имя мастера" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Категория *</label>
                <Select value={editItem.category || ''} onValueChange={v => setEditItem({ ...editItem, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MASTER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                <label className="text-sm font-medium text-gray-700">Район</label>
                <Input value={editItem.district || ''} onChange={e => setEditItem({ ...editItem, district: e.target.value })} placeholder="Сортировка" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={3} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Услуги (через запятую)</label>
                <Input value={editItem.services || ''} onChange={e => setEditItem({ ...editItem, services: e.target.value })} placeholder="Установка, ремонт..." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Рейтинг</label>
                  <Input type="number" min={1} max={5} step={0.1} value={editItem.rating ?? 5} onChange={e => setEditItem({ ...editItem, rating: parseFloat(e.target.value) || 5 })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Отзывы</label>
                  <Input type="number" min={0} value={editItem.reviews_count ?? 0} onChange={e => setEditItem({ ...editItem, reviews_count: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Опыт (лет)</label>
                  <Input type="number" min={0} value={editItem.experience_years ?? 1} onChange={e => setEditItem({ ...editItem, experience_years: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={editItem.verified ?? false} onCheckedChange={v => setEditItem({ ...editItem, verified: v })} />
                  <label className="text-sm text-gray-700">Проверенный</label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editItem.available_today ?? true} onCheckedChange={v => setEditItem({ ...editItem, available_today: v })} />
                  <label className="text-sm text-gray-700">Выезд сегодня</label>
                </div>
              </div>

              {/* Gallery Section */}
              <div className="border-t pt-3">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2">
                  <Images className="h-4 w-4 text-purple-600" /> Галерея работ (до 10 фото)
                </label>
                <MultiImageUpload
                  value={editItem.gallery_images || ''}
                  onChange={(keys) => setEditItem({ ...editItem, gallery_images: keys })}
                  folder="masters-gallery"
                  maxImages={10}
                />
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

// ============ MAIN EXPORT ============
export default function AdminMasters({ section }: { section: 'requests' | 'become' | 'catalog' }) {
  switch (section) {
    case 'requests': return <MasterRequestsSection />;
    case 'become': return <BecomeMasterSection />;
    case 'catalog': return <MastersCatalogSection />;
    default: return null;
  }
}