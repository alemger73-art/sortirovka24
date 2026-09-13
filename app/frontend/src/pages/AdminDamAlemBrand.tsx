import { humanizeApiError } from '@/lib/apiErrors';
import { useEffect, useRef, useState } from 'react';
import { invalidateAllCaches } from '@/lib/cache';
import {
  fetchFoodRestaurantsList,
  createFoodRestaurant,
  updateFoodRestaurant,
} from '@/lib/foodAdminApi';
import { DAM_ALEM_BRAND, findDamAlemRestaurantId, isDamAlemName } from '@/lib/damAlem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Save, Star, Clock, Phone, Truck, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';

interface Restaurant {
  id: number;
  name: string;
  photo: string;
  description: string;
  whatsapp_phone: string;
  working_hours: string;
  min_order: number;
  delivery_time: string;
  cuisine_type: string;
  rating: number;
  is_active: boolean;
  sort_order: number;
}

const DEFAULT_RESTAURANT: Partial<Restaurant> = {
  name: DAM_ALEM_BRAND,
  description: 'Доставка еды по Сортировке №1 — пицца, суши, бургеры и многое другое.',
  whatsapp_phone: '+77470304096',
  working_hours: '10:00 – 23:00',
  delivery_time: '35–45 мин',
  cuisine_type: 'pizza,sushi,burgers',
  min_order: 2000,
  rating: 4.9,
  is_active: true,
  sort_order: 1,
};

export default function AdminDamAlemBrand() {
  const [form, setForm] = useState<Partial<Restaurant>>(DEFAULT_RESTAURANT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await fetchFoodRestaurantsList();
      setLoaded(true);
      const id = findDamAlemRestaurantId(list);
      const found = id != null ? list.find(r => r.id === id) : list.find(r => isDamAlemName(r.name));
      if (found) {
        setForm(found);
      } else {
        setForm(DEFAULT_RESTAURANT);
      }
    } catch (e) {
      console.error(e);
      setLoaded(false);
      setError(humanizeApiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!loaded || savingRef.current || photoUploading) return;
    if (!form.name?.trim()) {
      toast.error('Введите название заведения');
      return;
    }
    if (!Number.isFinite(Number(form.min_order)) || Number(form.min_order) < 0 || !Number.isFinite(Number(form.rating)) || Number(form.rating) < 0 || Number(form.rating) > 5) {
      setError('Минимальный заказ должен быть не меньше нуля, рейтинг — от 0 до 5.');
      return;
    }
    savingRef.current = true;
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        photo: form.photo || '',
        description: form.description || '',
        whatsapp_phone: form.whatsapp_phone || '',
        working_hours: form.working_hours || '',
        delivery_time: form.delivery_time || '',
        cuisine_type: form.cuisine_type || '',
        min_order: Number(form.min_order || 0),
        rating: Number(form.rating ?? 4.5),
        is_active: form.is_active !== false,
        sort_order: Number(form.sort_order ?? 1),
      };
      if (form.id) {
        const updated = await updateFoodRestaurant(form.id, payload);
        setForm(prev => ({ ...prev, ...updated }));
      } else {
        const created = await createFoodRestaurant({
          ...payload,
          created_at: new Date().toISOString(),
        });
        setForm(prev => ({ ...prev, id: created.id }));
      }
      toast.success('Профиль DAM ALEM 2.0 сохранён');
      invalidateAllCaches();

    } catch (e) {
      console.error(e);
      const message = humanizeApiError(e);
      setError(message);
      toast.error(message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-[#FF3B30]" />
      </div>
    );
  }

  if (!loaded) return <div role="alert" className="space-y-3 rounded-xl border bg-white p-4"><p>Не удалось загрузить профиль заведения. {error}</p><Button onClick={() => void load()}>Повторить загрузку</Button></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Профиль заведения</h3>
          <p className="mt-1 text-sm text-gray-500">
            Название, фото и описание видны клиентам. Условия оформления заказа настраиваются во вкладке «Настройки».
          </p>
        </div>
        <Button onClick={save} disabled={saving || photoUploading} className="bg-[#FF3B30] hover:bg-[#e8352b]">
          <Save className="mr-1 h-4 w-4" />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} Введённые изменения сохранены в форме.</p>}

      {!form.id && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Запись DAM ALEM 2.0 ещё не создана в базе. Заполните поля и нажмите «Сохранить» — заведение будет создано автоматически.
        </div>
      )}

      <fieldset disabled={saving} className="grid min-w-0 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-white p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Фото / логотип</p>
            <ImageUpload
              value={form.photo || ''}
              onChange={key => setForm(prev => ({ ...prev, photo: key }))}
              folder="food"
              onUploadingChange={setPhotoUploading}
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm">
            <input
              type="checkbox"
              checked={form.is_active !== false}
              onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
            />
            Заведение активно (видно клиентам)
          </label>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Название *</label>
            <Input aria-label="Название" value={form.name || ''} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Описание</label>
            <Textarea
              rows={3}
              aria-label="Описание" value={form.description || ''}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Краткое описание для клиентов"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Phone className="h-4 w-4 text-[#FF3B30]" /> WhatsApp
              </div>
              <Input
                aria-label="WhatsApp" value={form.whatsapp_phone || ''}
                onChange={e => setForm(prev => ({ ...prev, whatsapp_phone: e.target.value }))}
                placeholder="+77470304096"
              />
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Clock className="h-4 w-4 text-[#FF3B30]" /> Время работы
              </div>
              <Input
                aria-label="Время работы" value={form.working_hours || ''}
                onChange={e => setForm(prev => ({ ...prev, working_hours: e.target.value }))}
                placeholder="10:00 – 23:00"
              />
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Truck className="h-4 w-4 text-[#FF3B30]" /> Срок доставки
              </div>
              <Input
                aria-label="Срок доставки" value={form.delivery_time || ''}
                onChange={e => setForm(prev => ({ ...prev, delivery_time: e.target.value }))}
                placeholder="35–45 мин"
              />
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                <DollarSign className="h-4 w-4 text-[#FF3B30]" /> Мин. заказ (₸)
              </div>
              <Input
                type="number"
                aria-label="Минимальный заказ" value={form.min_order ?? ''}
                onChange={e => setForm(prev => ({ ...prev, min_order: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Star className="h-4 w-4 text-[#FF3B30]" /> Рейтинг
              </div>
              <Input
                type="number"
                step="0.1"
                min={0}
                max={5}
                aria-label="Рейтинг" value={form.rating ?? ''}
                onChange={e => setForm(prev => ({ ...prev, rating: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="rounded-xl border bg-white p-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Типы кухни</label>
              <Input
                aria-label="Типы кухни" value={form.cuisine_type || ''}
                onChange={e => setForm(prev => ({ ...prev, cuisine_type: e.target.value }))}
                placeholder="pizza,sushi,burgers"
              />
              <p className="mt-1 text-xs text-gray-400">Через запятую, для фильтров</p>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
