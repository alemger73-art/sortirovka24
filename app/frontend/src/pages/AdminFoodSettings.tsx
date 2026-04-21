import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Phone, Image, DollarSign, Truck, Plus, Trash2, MapPin, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface SettingRow {
  id: number;
  setting_key: string;
  setting_value: string;
  is_active: boolean;
}

interface DeliveryZone {
  name: string;
  radius_km: number;
  price: number;
}

const SETTING_FIELDS = [
  { key: 'whatsapp_number', label: 'Номер WhatsApp', icon: Phone, placeholder: '+77001234567', description: 'Номер для получения заказов в WhatsApp' },
  { key: 'hero_banner_title', label: 'Заголовок баннера', icon: Image, placeholder: 'Вкусная еда с доставкой', description: 'Основной заголовок на странице еды' },
  { key: 'hero_banner_subtitle', label: 'Подзаголовок баннера', icon: Image, placeholder: 'Свежие блюда домашней кухни', description: 'Текст под заголовком' },
  { key: 'hero_banner_image', label: 'URL изображения баннера', icon: Image, placeholder: 'https://...', description: 'Фоновое изображение (необязательно)' },
  { key: 'min_order_amount', label: 'Минимальная сумма заказа (₸)', icon: DollarSign, placeholder: '2000', description: 'Минимальная сумма для оформления заказа' },
  { key: 'delivery_price', label: 'Базовая стоимость доставки (₸)', icon: Truck, placeholder: '500', description: 'Используется если зоны доставки не настроены' },
];

const DEFAULT_ZONES: DeliveryZone[] = [
  { name: 'Зона 1 (ближняя)', radius_km: 2, price: 200 },
  { name: 'Зона 2 (средняя)', radius_km: 3, price: 400 },
  { name: 'Зона 3 (дальняя)', radius_km: 5, price: 600 },
];

export default function AdminFoodSettings() {
  const [settingsRows, setSettingsRows] = useState<SettingRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delivery zones
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(true);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.food_settings.query({ limit: 50 }));
      const rows: SettingRow[] = res?.data?.items || [];
      setSettingsRows(rows);
      const vals: Record<string, string> = {};
      rows.forEach(r => { vals[r.setting_key] = r.setting_value || ''; });
      setValues(vals);

      // Parse delivery zones
      try {
        const parsed = JSON.parse(vals.delivery_zones || '[]');
        setZones(Array.isArray(parsed) && parsed.length > 0 ? parsed : []);
      } catch {
        setZones([]);
      }

      // Parse show_recommendations
      setShowRecommendations(vals.show_recommendations !== 'false');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки настроек');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      // Merge zones and recommendations into values
      const allValues = {
        ...values,
        delivery_zones: JSON.stringify(zones),
        show_recommendations: showRecommendations ? 'true' : 'false',
      };

      const allKeys = [...SETTING_FIELDS.map(f => f.key), 'delivery_zones', 'show_recommendations'];

      for (const key of allKeys) {
        const existing = settingsRows.find(r => r.setting_key === key);
        const newValue = allValues[key] || '';
        if (existing) {
          if (existing.setting_value !== newValue) {
            await withRetry(() => client.entities.food_settings.update({ id: String(existing.id), data: { setting_value: newValue } }));
          }
        } else {
          await withRetry(() => client.entities.food_settings.create({
            data: {
              setting_key: key,
              setting_value: newValue,
              is_active: true,
            }
          }));
        }
      }
      toast.success('Настройки сохранены');
      invalidateAllCaches();
      loadSettings();
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function addZone() {
    setZones(prev => [...prev, { name: `Зона ${prev.length + 1}`, radius_km: (prev.length + 1) * 2, price: (prev.length + 1) * 200 }]);
  }

  function updateZone(index: number, field: keyof DeliveryZone, value: string | number) {
    setZones(prev => prev.map((z, i) => i === index ? { ...z, [field]: value } : z));
  }

  function removeZone(index: number) {
    setZones(prev => prev.filter((_, i) => i !== index));
  }

  function loadDefaultZones() {
    setZones(DEFAULT_ZONES);
  }

  if (loading) {
    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Настройки доставки еды</h3>
        <Button onClick={saveSettings} disabled={saving} className="bg-orange-500 hover:bg-orange-600">
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>

      {/* Basic settings */}
      <div className="space-y-4">
        {SETTING_FIELDS.map(field => {
          const Icon = field.icon;
          return (
            <div key={field.key} className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="w-4 h-4 text-orange-500" />
                <label className="font-medium text-sm text-gray-800">{field.label}</label>
              </div>
              <p className="text-xs text-gray-400 mb-2">{field.description}</p>
              <Input
                value={values[field.key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
              />
            </div>
          );
        })}
      </div>

      {/* ═══ DELIVERY ZONES ═══ */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-orange-500" />
            <label className="font-medium text-sm text-gray-800">Зоны доставки</label>
          </div>
          <div className="flex gap-2">
            {zones.length === 0 && (
              <Button size="sm" variant="outline" onClick={loadDefaultZones} className="text-xs h-8">
                Загрузить шаблон
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={addZone} className="text-xs h-8">
              <Plus className="w-3 h-3 mr-1" /> Добавить зону
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Настройте зоны доставки с разной стоимостью. Если зоны не настроены, используется базовая стоимость доставки.
        </p>

        {zones.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Зоны доставки не настроены</p>
            <p className="text-xs text-gray-400 mt-1">Используется базовая стоимость доставки</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {zones.map((zone, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Название</label>
                    <Input
                      value={zone.name}
                      onChange={e => updateZone(idx, 'name', e.target.value)}
                      placeholder="Зона 1"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Радиус (км)</label>
                    <Input
                      type="number"
                      value={zone.radius_km}
                      onChange={e => updateZone(idx, 'radius_km', parseFloat(e.target.value) || 0)}
                      placeholder="2"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Цена (₸)</label>
                    <Input
                      type="number"
                      value={zone.price}
                      onChange={e => updateZone(idx, 'price', parseInt(e.target.value) || 0)}
                      placeholder="200"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 h-9 w-9 p-0 flex-shrink-0 mt-4"
                  onClick={() => removeZone(idx)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ RECOMMENDATIONS TOGGLE ═══ */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <div>
              <label className="font-medium text-sm text-gray-800">Рекомендации</label>
              <p className="text-xs text-gray-400 mt-0.5">Показывать блок «Рекомендуем» и «Дополнить заказ»</p>
            </div>
          </div>
          <button
            onClick={() => setShowRecommendations(!showRecommendations)}
            className="flex items-center gap-2"
          >
            {showRecommendations ? (
              <ToggleRight className="w-8 h-8 text-green-600" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Preview */}
      {values.hero_banner_title && (
        <div className="mt-6">
          <h4 className="font-semibold text-sm text-gray-600 mb-2">Предпросмотр баннера</h4>
          <div className="relative bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 text-white rounded-2xl overflow-hidden p-6">
            {values.hero_banner_image && (
              <div className="absolute inset-0 opacity-30">
                <img src={values.hero_banner_image} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="relative">
              <h2 className="text-2xl font-bold">{values.hero_banner_title}</h2>
              <p className="text-white/80 mt-1">{values.hero_banner_subtitle}</p>
              <div className="flex gap-3 mt-3 text-sm flex-wrap">
                {zones.length > 0 ? (
                  zones.map((zone, idx) => (
                    <span key={idx} className="bg-white/15 px-3 py-1 rounded-full">
                      {zone.name}: {zone.price} ₸
                    </span>
                  ))
                ) : (
                  <span className="bg-white/15 px-3 py-1 rounded-full">Доставка {values.delivery_price || '0'} ₸</span>
                )}
                <span className="bg-white/15 px-3 py-1 rounded-full">Мин. заказ {values.min_order_amount || '0'} ₸</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}