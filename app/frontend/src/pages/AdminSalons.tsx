import { useState, useEffect } from 'react';
import { client, withRetry, SALON_CATEGORIES, salonCategoryIcon } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, Phone, MapPin, Images, Star, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload from '@/components/MultiImageUpload';

interface Salon {
  id: number;
  name: string;
  category: string;
  address?: string;
  district?: string;
  phone: string;
  whatsapp?: string;
  instagram?: string;
  description?: string;
  services?: string;
  working_hours?: string;
  price_from?: string;
  photo_url?: string;
  gallery_images?: string;
  rating?: number;
  reviews_count?: number;
  verified?: boolean;
  featured?: boolean;
  sort_order?: number | null;
  created_at?: string;
}

export default function AdminSalons() {
  const [items, setItems] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Salon> | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.salons.query({ sort: 'sort_order', limit: 200 }));
      setItems(res.data?.items || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = filterCategory ? items.filter(i => i.category === filterCategory) : items;

  const openCreate = () => {
    setEditItem({
      name: '', category: SALON_CATEGORIES[0], address: '', district: 'Сортировка',
      phone: '', whatsapp: '', instagram: '', description: '', services: '',
      working_hours: 'Ежедневно 09:00–21:00', price_from: '', photo_url: '', gallery_images: '',
      rating: 0, reviews_count: 0, verified: false, featured: false, sort_order: (items.length + 1),
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Salon) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.name || !editItem?.phone || !editItem?.category) {
      toast.error('Заполните название, категорию и телефон');
      return;
    }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: editItem.name,
        category: editItem.category,
        address: editItem.address || '',
        district: editItem.district || '',
        phone: editItem.phone,
        whatsapp: editItem.whatsapp || '',
        instagram: editItem.instagram || '',
        description: editItem.description || '',
        services: editItem.services || '',
        working_hours: editItem.working_hours || '',
        price_from: editItem.price_from || '',
        photo_url: editItem.photo_url || '',
        gallery_images: editItem.gallery_images || '',
        rating: Number(editItem.rating) || 0,
        reviews_count: Number(editItem.reviews_count) || 0,
        verified: editItem.verified ?? false,
        featured: editItem.featured ?? false,
        sort_order: editItem.sort_order ?? (items.length + 1),
      };
      if (editItem.id) {
        await withRetry(() => client.entities.salons.update({ id: String(editItem.id), data }));
        toast.success('Салон обновлён');
      } else {
        await withRetry(() => client.entities.salons.create({ data: { ...data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) } }));
        toast.success('Салон создан');
      }
      invalidateAllCaches();
      setDialogOpen(false);
      fetchItems();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить салон?')) return;
    try {
      await withRetry(() => client.entities.salons.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      fetchItems();
    } catch { toast.error('Ошибка удаления'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-pink-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">{items.length} салонов</p>
        <div className="flex items-center gap-2">
          <Select value={filterCategory || 'all'} onValueChange={v => setFilterCategory(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[190px] h-9 text-sm">
              <SelectValue placeholder="Все категории" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              {SALON_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm" className="bg-pink-600 hover:bg-pink-700">
            <Plus className="h-4 w-4 mr-1" /> Добавить салон
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map(item => (
          <Card key={item.id}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {item.photo_url ? (
                    <StorageImage objectKey={item.photo_url} alt={item.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0 text-2xl">
                      {salonCategoryIcon(item.category)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      {item.featured && <Badge className="text-xs bg-pink-100 text-pink-800"><Sparkles className="h-3 w-3 mr-0.5" />Топ</Badge>}
                      {item.verified && <Badge className="text-xs bg-green-100 text-green-800">✓ Проверен</Badge>}
                      {item.gallery_images && (
                        <Badge className="text-xs bg-purple-100 text-purple-800">
                          <Images className="h-3 w-3 mr-0.5" />
                          {item.gallery_images.split(',').filter(Boolean).length}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm text-gray-900">{item.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
                      {item.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.address}</span>}
                      {item.rating ? <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500" />{item.rating}</span> : null}
                    </div>
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
        {filtered.length === 0 && <p className="text-center text-gray-400 py-8">Нет салонов</p>}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Редактировать салон' : 'Новый салон'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Обложка салона</label>
                <ImageUpload
                  value={editItem.photo_url || ''}
                  onChange={(key) => setEditItem({ ...editItem, photo_url: key })}
                  folder="salons"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Название *</label>
                <Input value={editItem.name || ''} onChange={e => setEditItem({ ...editItem, name: e.target.value })} placeholder="Название салона" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Категория *</label>
                  <Select value={editItem.category || ''} onValueChange={v => setEditItem({ ...editItem, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SALON_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Цена от</label>
                  <Input value={editItem.price_from || ''} onChange={e => setEditItem({ ...editItem, price_from: e.target.value })} placeholder="2000 ₸" />
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
                  <label className="text-sm font-medium text-gray-700">Instagram</label>
                  <Input value={editItem.instagram || ''} onChange={e => setEditItem({ ...editItem, instagram: e.target.value })} placeholder="@username" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Адрес</label>
                  <Input value={editItem.address || ''} onChange={e => setEditItem({ ...editItem, address: e.target.value })} placeholder="ул. ..., д. ..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Район</label>
                  <Input value={editItem.district || ''} onChange={e => setEditItem({ ...editItem, district: e.target.value })} placeholder="Сортировка" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Режим работы</label>
                <Input value={editItem.working_hours || ''} onChange={e => setEditItem({ ...editItem, working_hours: e.target.value })} placeholder="Ежедневно 09:00–21:00" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.description || ''} onChange={e => setEditItem({ ...editItem, description: e.target.value })} rows={3} placeholder="Коротко о салоне" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Услуги и цены (по одной в строке или через запятую)</label>
                <Textarea value={editItem.services || ''} onChange={e => setEditItem({ ...editItem, services: e.target.value })} rows={4} placeholder={'Женская стрижка — 4000 ₸\nМаникюр с покрытием — 6000 ₸'} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Рейтинг (0–5)</label>
                  <Input type="number" min={0} max={5} step={0.1} value={editItem.rating ?? 0} onChange={e => setEditItem({ ...editItem, rating: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Кол-во отзывов</label>
                  <Input type="number" min={0} value={editItem.reviews_count ?? 0} onChange={e => setEditItem({ ...editItem, reviews_count: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Порядок</label>
                  <Input type="number" min={0} value={editItem.sort_order ?? 0} onChange={e => setEditItem({ ...editItem, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={editItem.featured ?? false} onCheckedChange={v => setEditItem({ ...editItem, featured: v })} />
                  <label className="text-sm text-gray-700">Рекомендуем (топ)</label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editItem.verified ?? false} onCheckedChange={v => setEditItem({ ...editItem, verified: v })} />
                  <label className="text-sm text-gray-700">Проверен</label>
                </div>
              </div>

              <div className="border-t pt-3">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2">
                  <Images className="h-4 w-4 text-purple-600" /> Галерея (до 10 фото)
                </label>
                <MultiImageUpload
                  value={editItem.gallery_images || ''}
                  onChange={(keys) => setEditItem({ ...editItem, gallery_images: keys })}
                  folder="salons-gallery"
                  maxImages={10}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">Отмена</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-pink-600 hover:bg-pink-700">
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
