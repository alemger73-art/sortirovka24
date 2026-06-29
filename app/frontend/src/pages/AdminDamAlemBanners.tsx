import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { withRetry } from '@/lib/api';
import {
  createBanner,
  deleteBanner,
  fetchBannersList,
  updateBanner,
  type BannerPayload,
} from '@/lib/foodAdminApi';
import { humanizeApiError } from '@/lib/apiErrors';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, ExternalLink, Image } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload, { StorageImage } from '@/components/ImageUpload';
import { damAlemPromoBannerSizeHint, DAM_ALEM_PROMO_BANNER_SPEC } from '@/lib/bannerSpecs';

interface Banner {
  id: number;
  title: string;
  banner_text?: string;
  subtitle?: string;
  image_url?: string;
  link_url?: string;
  button_text?: string;
  button_url?: string;
  banner_type?: string;
  active?: boolean;
}

const BANNER_TYPES: Record<string, string> = {
  food_delivery: 'Доставка еды',
  promo: 'Промо',
  hero: 'Главный',
  other: 'Другое',
};

function isFoodBanner(b: Banner) {
  const url = (b.button_url || b.link_url || '').toLowerCase();
  const title = (b.title || '').toLowerCase();
  return url.includes('/food') || title.includes('dam alem') || title.includes('доставка еды') || b.banner_type === 'food_delivery';
}

export default function AdminDamAlemBanners() {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Banner> | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const rows: Banner[] = await withRetry(() => fetchBannersList({ sort: '-created_at', limit: 100 }));
      setItems(showAll ? rows : rows.filter(isFoodBanner));
    } catch (err) {
      toast.error(humanizeApiError(err) || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, [showAll]);

  const openCreate = () => {
    setEditItem({
      title: '',
      banner_text: '',
      subtitle: '',
      image_url: '',
      link_url: '/food',
      button_text: 'Заказать',
      button_url: '/food',
      banner_type: 'food_delivery',
      active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Banner) => {
    setEditItem({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editItem?.title?.trim()) {
      toast.error('Заполните заголовок');
      return;
    }
    setSaving(true);
    try {
      const data: BannerPayload = {
        title: editItem.title.trim(),
        banner_text: editItem.banner_text || '',
        subtitle: editItem.subtitle || '',
        image_url: editItem.image_url || '',
        link_url: editItem.link_url || '/food',
        button_text: editItem.button_text || 'Заказать',
        button_url: editItem.button_url || '/food',
        banner_type: editItem.banner_type || 'food_delivery',
        active: editItem.active ?? true,
      };
      if (editItem.id) {
        await withRetry(() => updateBanner(editItem.id!, data));
        toast.success('Баннер обновлён');
      } else {
        await withRetry(() => createBanner({
          ...data,
          created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        }));
        toast.success('Баннер создан');
      }
      invalidateAllCaches();
      setDialogOpen(false);
      fetchItems();
    } catch (err) {
      toast.error(humanizeApiError(err) || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить баннер?')) return;
    try {
      await withRetry(() => deleteBanner(id));
      invalidateAllCaches();
      toast.success('Удалено');
      fetchItems();
    } catch (err) {
      toast.error(humanizeApiError(err) || 'Ошибка удаления');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF3B30]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Баннеры DAM ALEM</p>
          <p className="mt-1 text-xs text-gray-600">
            Карусель «Спецпредложения» на странице /food. По умолчанию — баннеры со ссылкой на /food.
          </p>
          <p className="mt-2 text-xs text-orange-800/90">
            <span className="font-medium">Размер изображения:</span>{' '}
            {damAlemPromoBannerSizeHint(true)} · соотношение {DAM_ALEM_PROMO_BANNER_SPEC.aspectRatio}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Только еда' : 'Показать все'}
          </Button>
          <Button size="sm" className="bg-[#FF3B30] hover:bg-[#e8352b]" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Добавить
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                {item.image_url ? (
                  <StorageImage objectKey={item.image_url} alt="" className="h-14 w-20 flex-shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF3B30] to-[#c41e14]">
                    <Image className="h-6 w-6 text-white/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {BANNER_TYPES[item.banner_type || 'other'] || item.banner_type}
                    </Badge>
                    {item.active === false ? (
                      <Badge variant="destructive" className="text-xs">Неактивен</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-xs text-green-800">Активен</Badge>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                  {item.subtitle && <p className="truncate text-xs text-gray-500">{item.subtitle}</p>}
                  <p className="mt-0.5 text-xs text-gray-400">
                    {item.button_text || '—'} → {item.button_url || item.link_url || '—'}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4 text-[#FF3B30]" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <Image className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-medium text-gray-800">Нет баннеров</p>
            <p className="mt-1 text-sm text-gray-500">Создайте первый баннер для страницы DAM ALEM</p>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-400">
        <Link to="/food" target="_blank" className="inline-flex items-center gap-1 text-[#FF3B30] hover:underline">
          Посмотреть на витрине <ExternalLink className="h-3 w-3" />
        </Link>
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Редактировать баннер' : 'Новый баннер'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Тип</label>
                <Select value={editItem.banner_type || 'food_delivery'} onValueChange={v => setEditItem({ ...editItem, banner_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BANNER_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Заголовок *</label>
                <Input value={editItem.title || ''} onChange={e => setEditItem({ ...editItem, title: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Подзаголовок</label>
                <Input value={editItem.subtitle || ''} onChange={e => setEditItem({ ...editItem, subtitle: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Описание</label>
                <Textarea value={editItem.banner_text || ''} onChange={e => setEditItem({ ...editItem, banner_text: e.target.value })} rows={2} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Изображение</label>
                <p className="mt-0.5 text-xs text-gray-500">{damAlemPromoBannerSizeHint()}</p>
                <div className="mt-2">
                  <ImageUpload value={editItem.image_url || ''} onChange={key => setEditItem({ ...editItem, image_url: key })} folder="banners" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Текст кнопки</label>
                  <Input value={editItem.button_text || ''} onChange={e => setEditItem({ ...editItem, button_text: e.target.value })} placeholder="Заказать" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">URL кнопки</label>
                  <Input value={editItem.button_url || ''} onChange={e => setEditItem({ ...editItem, button_url: e.target.value })} placeholder="/food" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ссылка (основная)</label>
                <Input value={editItem.link_url || ''} onChange={e => setEditItem({ ...editItem, link_url: e.target.value })} placeholder="/food" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editItem.active ?? true} onCheckedChange={v => setEditItem({ ...editItem, active: v })} />
                <label className="text-sm text-gray-700">Активен</label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setDialogOpen(false)} variant="outline" className="flex-1">Отмена</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#FF3B30] hover:bg-[#e8352b]">
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
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
