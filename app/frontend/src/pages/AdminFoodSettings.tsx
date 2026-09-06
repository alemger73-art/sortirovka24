import { useState, useEffect } from 'react';

import { client, withRetry } from '@/lib/api';

import { invalidateAllCaches } from '@/lib/cache';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Textarea } from '@/components/ui/textarea';

import {

  Save, Phone, Image, DollarSign, Truck, Plus, Trash2, MapPin,

  ToggleLeft, ToggleRight, Sparkles, Megaphone, Gift,

} from 'lucide-react';

import { toast } from 'sonner';

import ImageUpload from '@/components/ImageUpload';

import DeliveryZoneEditor from '@/components/gastronom/DeliveryZoneEditor';

import LoyaltyGiftsEditor from '@/components/gastronom/LoyaltyGiftsEditor';

import FoodPromoCodesEditor from '@/components/damalem/FoodPromoCodesEditor';

import { parsePromoCodes, serializePromoCodes, type FoodPromoCode } from '@/lib/foodPromo';

import {

  type DeliveryZone,

  DEFAULT_STORE,

  parseDeliveryZones,

  serializeDeliveryZones,

} from '@/lib/gastronomDelivery';

import {

  type LoyaltyGift,

  parseLoyaltyGifts,

  serializeLoyaltyGifts,

  newLoyaltyGift,

} from '@/lib/gastronomLoyalty';

import { damAlemHeroBannerSizeHint } from '@/lib/bannerSpecs';



interface SettingRow {

  id: number;

  setting_key: string;

  setting_value: string;

  is_active: boolean;

}



export interface PromoSlide {

  title: string;

  lines: string[];

}



interface AdminFoodSettingsProps {

  damAlemMode?: boolean;

}



type SettingsTab = 'general' | 'zones' | 'gifts';



const SETTING_FIELDS = [

  { key: 'whatsapp_number', label: 'Номер WhatsApp', icon: Phone, placeholder: '+77001234567', description: 'Номер для получения заказов в WhatsApp', type: 'text' as const },

  { key: 'hero_banner_title', label: 'Заголовок баннера', icon: Image, placeholder: 'DAM ALEM 2.0', description: 'Бренд на странице доставки', type: 'text' as const },

  { key: 'hero_banner_subtitle', label: 'Подзаголовок баннера', icon: Image, placeholder: 'Доставка еды №1 в Сортировке', description: 'Слоган под брендом', type: 'text' as const },

  { key: 'min_order_amount', label: 'Минимальная сумма заказа (₸)', icon: DollarSign, placeholder: '2000', description: 'Минимальная сумма для оформления заказа', type: 'text' as const },

  { key: 'delivery_price', label: 'Базовая стоимость доставки (₸)', icon: Truck, placeholder: '500', description: 'Если зоны на карте не настроены', type: 'text' as const },

  { key: 'free_delivery_from', label: 'Бесплатная доставка от (₸)', icon: Truck, placeholder: '15000', description: 'При заказе от этой суммы доставка 0 ₸', type: 'text' as const },

  { key: 'service_fee_rate', label: 'Сервисный сбор (%)', icon: DollarSign, placeholder: '10', description: 'Процент от суммы заказа (например 10 = 10%)', type: 'text' as const },

  { key: 'default_address', label: 'Адрес по умолчанию', icon: MapPin, placeholder: 'ул. Жекибаева 129', description: 'Подставляется в форму заказа', type: 'text' as const },

  { key: 'delivery_city', label: 'Город доставки', icon: MapPin, placeholder: 'Караганда', description: 'Для поиска адреса на карте', type: 'text' as const },

  { key: 'delivery_area', label: 'Район доставки', icon: MapPin, placeholder: 'Сортировка, Караганда', description: 'Показывается клиенту в подсказках', type: 'text' as const },

  { key: 'delivery_time', label: 'Время доставки', icon: Truck, placeholder: '35–45 мин', description: 'Показывается клиенту в шапке', type: 'text' as const },

  { key: 'working_hours', label: 'Часы работы', icon: Truck, placeholder: '10:00-22:00', description: 'Формат: открытие-закрытие. Вне часов — приём заказов закрыт', type: 'text' as const },

];



const EXTRA_KEYS = [

  'hero_banner_image',

  'delivery_zones',

  'show_recommendations',

  'promo_slides',

  'store_lat',

  'store_lng',

  'outside_zone_message',

  'loyalty_enabled',

  'loyalty_gifts',

  'promo_codes',

];



export default function AdminFoodSettings({ damAlemMode = false }: AdminFoodSettingsProps) {

  const [settingsRows, setSettingsRows] = useState<SettingRow[]>([]);

  const [values, setValues] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');



  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);

  const [storeLat, setStoreLat] = useState(DEFAULT_STORE[0]);

  const [storeLng, setStoreLng] = useState(DEFAULT_STORE[1]);

  const [outsideZoneMessage, setOutsideZoneMessage] = useState('');



  const [loyaltyGifts, setLoyaltyGifts] = useState<LoyaltyGift[]>([]);

  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);



  const [showRecommendations, setShowRecommendations] = useState(true);

  const [promoSlides, setPromoSlides] = useState<PromoSlide[]>([]);

  const [promoCodes, setPromoCodes] = useState<FoodPromoCode[]>([]);

  const [heroImage, setHeroImage] = useState('');



  useEffect(() => { loadSettings(); }, []);



  async function loadSettings() {

    setLoading(true);

    try {

      const res = await withRetry(() => client.entities.food_settings.query({ limit: 100 }));

      const rows: SettingRow[] = res?.data?.items || [];

      setSettingsRows(rows);

      const vals: Record<string, string> = {};

      rows.forEach(r => { vals[r.setting_key] = r.setting_value || ''; });

      if (!vals.free_delivery_from) vals.free_delivery_from = '15000';

      if (!vals.delivery_time) vals.delivery_time = '35–45 мин';

      if (!vals.working_hours) vals.working_hours = '10:00-22:00';

      setValues(vals);



      setDeliveryZones(parseDeliveryZones(vals.delivery_zones, storeLat, storeLng));

      setStoreLat(parseFloat(vals.store_lat || '') || DEFAULT_STORE[0]);

      setStoreLng(parseFloat(vals.store_lng || '') || DEFAULT_STORE[1]);

      setOutsideZoneMessage(vals.outside_zone_message || '');



      setLoyaltyGifts(parseLoyaltyGifts(vals.loyalty_gifts));

      setLoyaltyEnabled(vals.loyalty_enabled !== '0' && vals.loyalty_enabled !== 'false');

      setPromoCodes(parsePromoCodes(vals.promo_codes));



      setShowRecommendations(vals.show_recommendations !== 'false');

      setHeroImage(vals.hero_banner_image || '');



      try {

        const parsedPromo = JSON.parse(vals.promo_slides || '[]');

        setPromoSlides(Array.isArray(parsedPromo) && parsedPromo.length > 0 ? parsedPromo : []);

      } catch {

        setPromoSlides([]);

      }

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

      const allValues: Record<string, string> = {

        ...values,

        hero_banner_image: heroImage,

        delivery_zones: serializeDeliveryZones(deliveryZones),

        show_recommendations: showRecommendations ? 'true' : 'false',

        promo_slides: JSON.stringify(promoSlides),

        store_lat: String(storeLat),

        store_lng: String(storeLng),

        outside_zone_message: outsideZoneMessage,

        loyalty_enabled: loyaltyEnabled ? '1' : '0',

        loyalty_gifts: serializeLoyaltyGifts(loyaltyGifts),

        promo_codes: serializePromoCodes(promoCodes),

      };



      const allKeys = [...SETTING_FIELDS.map(f => f.key), ...EXTRA_KEYS];



      for (const key of allKeys) {

        const existing = settingsRows.find(r => r.setting_key === key);

        const newValue = allValues[key] ?? '';

        if (existing) {

          if (existing.setting_value !== newValue) {

            await withRetry(() => client.entities.food_settings.update({ id: String(existing.id), data: { setting_value: newValue } }));

          }

        } else if (newValue) {

          await withRetry(() => client.entities.food_settings.create({

            data: { setting_key: key, setting_value: newValue, is_active: true },

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



  function loadDefaultPromoSlides() {

    setPromoSlides([

      { title: 'Бесплатная доставка', lines: ['При заказе от 15 000 ₸', 'По всей Сортировке', 'Каждый день'] },

      { title: 'Подарки к заказу', lines: ['Салат от 5 000 ₸', 'Напиток от 10 000 ₸', 'Десерт от 15 000 ₸'] },

      { title: 'Новинки меню', lines: ['Попробуйте первыми', 'Свежие блюда', 'Каждую неделю'] },

    ]);

  }



  function loadDefaultGifts() {

    setLoyaltyGifts([

      { ...newLoyaltyGift(0), min_amount: 5000, title: 'Салат в подарок', description: 'Лёгкий салат к заказу', is_active: true },

      { ...newLoyaltyGift(1), min_amount: 10000, title: 'Напиток 0,5 л', description: 'На выбор из меню', is_active: true },

      { ...newLoyaltyGift(2), min_amount: 15000, title: 'Десерт', description: 'Сладкое завершение обеда', is_active: true },

    ]);

    setLoyaltyEnabled(true);

  }



  function addPromoSlide() {

    setPromoSlides(prev => [...prev, { title: '', lines: ['', ''] }]);

  }



  function updatePromoSlide(index: number, field: 'title' | 'lines', value: string | string[]) {

    setPromoSlides(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));

  }



  function removePromoSlide(index: number) {

    setPromoSlides(prev => prev.filter((_, i) => i !== index));

  }



  if (loading) {

    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" /></div>;

  }



  const tabBtn = (id: SettingsTab, label: string, Icon: typeof MapPin) => (

    <button

      type="button"

      onClick={() => setSettingsTab(id)}

      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${

        settingsTab === id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

      }`}

    >

      <Icon className="h-4 w-4" /> {label}

    </button>

  );



  return (

    <div className="space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <h3 className="font-bold text-lg">{damAlemMode ? 'Настройки DAM ALEM 2.0' : 'Настройки доставки еды'}</h3>

        <Button onClick={saveSettings} disabled={saving} className="bg-orange-500 hover:bg-orange-600">

          <Save className="w-4 h-4 mr-1" /> {saving ? 'Сохранение...' : 'Сохранить всё'}

        </Button>

      </div>



      <div className="flex flex-wrap gap-2">

        {tabBtn('general', 'Основное', Sparkles)}

        {tabBtn('zones', 'Зоны на карте', MapPin)}

        {tabBtn('gifts', 'Подарки', Gift)}

      </div>



      {settingsTab === 'zones' && (

        <div className="space-y-4">

          <div className="rounded-xl border bg-white p-4">

            <h4 className="font-semibold text-gray-900 mb-1">Зоны доставки на карте</h4>

            <p className="text-xs text-gray-500 mb-4">

              Нарисуйте полигоны на карте — стоимость доставки определится автоматически по адресу клиента.

              Клик — точка границы, двойной клик — переместить точку магазина.

            </p>

            <DeliveryZoneEditor

              zones={deliveryZones}

              storeLat={storeLat}

              storeLng={storeLng}

              onZonesChange={setDeliveryZones}

              onStoreChange={(lat, lng) => { setStoreLat(lat); setStoreLng(lng); }}

            />

          </div>

          <div className="rounded-xl border bg-white p-4">

            <label className="text-sm font-medium text-gray-700 mb-1 block">Сообщение вне зоны доставки</label>

            <Textarea

              value={outsideZoneMessage}

              onChange={(e) => setOutsideZoneMessage(e.target.value)}

              rows={2}

              placeholder="Доставка по этому адресу недоступна..."

            />

          </div>

        </div>

      )}



      {settingsTab === 'gifts' && (

        <div className="space-y-4">

          <Button type="button" variant="outline" size="sm" onClick={loadDefaultGifts}>

            Загрузить шаблон подарков

          </Button>

          <LoyaltyGiftsEditor

            gifts={loyaltyGifts}

            onChange={setLoyaltyGifts}

            enabled={loyaltyEnabled}

            onEnabledChange={setLoyaltyEnabled}

          />

        </div>

      )}



      {settingsTab === 'general' && (

        <>

          <div className="rounded-xl border bg-white p-4">

            <div className="mb-1.5 flex items-center gap-2">

              <Image className="h-4 w-4 text-orange-500" />

              <label className="text-sm font-medium text-gray-800">Фоновое изображение баннера</label>

            </div>

            <p className="mb-2 text-xs text-gray-500">{damAlemHeroBannerSizeHint()}</p>

            <ImageUpload value={heroImage} onChange={setHeroImage} folder="food" />

          </div>



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



          <div className="rounded-xl border bg-white p-4">

            <FoodPromoCodesEditor codes={promoCodes} onChange={setPromoCodes} />

          </div>



          <div className="rounded-xl border bg-white p-4">

            <div className="mb-3 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <Megaphone className="h-4 w-4 text-orange-500" />

                <label className="text-sm font-medium text-gray-800">Промо-слайды в шапке</label>

              </div>

              <div className="flex gap-2">

                {promoSlides.length === 0 && (

                  <Button size="sm" variant="outline" onClick={loadDefaultPromoSlides} className="text-xs h-8">Шаблон</Button>

                )}

                <Button size="sm" variant="outline" onClick={addPromoSlide} className="text-xs h-8">

                  <Plus className="mr-1 h-3 w-3" /> Слайд

                </Button>

              </div>

            </div>

            {promoSlides.length === 0 ? (

              <p className="text-center py-4 text-sm text-gray-400">Слайды не настроены</p>

            ) : (

              <div className="space-y-3">

                {promoSlides.map((slide, idx) => (

                  <div key={idx} className="rounded-lg bg-gray-50 p-3 space-y-2">

                    <div className="flex gap-2">

                      <Input placeholder="Заголовок" value={slide.title} onChange={e => updatePromoSlide(idx, 'title', e.target.value)} className="flex-1" />

                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => removePromoSlide(idx)}><Trash2 className="h-4 w-4" /></Button>

                    </div>

                    {slide.lines.map((line, lineIdx) => (

                      <Input

                        key={lineIdx}

                        placeholder={`Строка ${lineIdx + 1}`}

                        value={line}

                        onChange={e => {

                          const newLines = [...slide.lines];

                          newLines[lineIdx] = e.target.value;

                          updatePromoSlide(idx, 'lines', newLines);

                        }}

                      />

                    ))}

                  </div>

                ))}

              </div>

            )}

          </div>



          <div className="bg-white rounded-xl border p-4">

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-2">

                <Sparkles className="w-4 h-4 text-orange-500" />

                <div>

                  <label className="font-medium text-sm text-gray-800">Рекомендации</label>

                  <p className="text-xs text-gray-400 mt-0.5">Блок «Рекомендуем» и «Дополнить заказ»</p>

                </div>

              </div>

              <button type="button" onClick={() => setShowRecommendations(!showRecommendations)}>

                {showRecommendations ? <ToggleRight className="w-8 h-8 text-green-600" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}

              </button>

            </div>

          </div>

        </>

      )}

    </div>

  );

}


