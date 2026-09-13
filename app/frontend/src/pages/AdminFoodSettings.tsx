import { useLanguage } from '@/contexts/LanguageContext';
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



type SettingsTab = 'delivery' | 'promo' | 'gifts' | 'zones' | 'general';

const DELIVERY_KEYS = [
  'min_order_amount',
  'delivery_price',
  'free_delivery_from',
  'apartment_delivery_price',
  'apartment_free_from',
  'delivery_time',
  'working_hours',
];



function getSETTING_FIELDS(adminT: (key: string) => string) {
  const SETTING_FIELDS = [

  { key: 'whatsapp_number', label: adminT("admin.ui.0548"), icon: Phone, placeholder: '+77001234567', description: adminT("admin.ui.0549"), type: 'text' as const },

  { key: 'hero_banner_title', label: adminT("admin.ui.0119"), icon: Image, placeholder: 'DAM ALEM 2.0', description: adminT("admin.ui.0550"), type: 'text' as const },

  { key: 'hero_banner_subtitle', label: adminT("admin.ui.0551"), icon: Image, placeholder: adminT("admin.ui.0552"), description: adminT("admin.ui.0553"), type: 'text' as const },

  { key: 'min_order_amount', label: adminT("admin.ui.0554"), icon: DollarSign, placeholder: '2000', description: adminT("admin.ui.0555"), type: 'text' as const },

  { key: 'delivery_price', label: adminT("admin.ui.0556"), icon: Truck, placeholder: '500', description: adminT("admin.ui.0557"), type: 'text' as const },

  { key: 'free_delivery_from', label: adminT("admin.ui.0558"), icon: Truck, placeholder: '15000', description: adminT("admin.ui.0559"), type: 'text' as const },

  { key: 'apartment_delivery_price', label: adminT("admin.ui.0560"), icon: Truck, placeholder: '300', description: adminT("admin.ui.0561"), type: 'text' as const },

  { key: 'apartment_free_from', label: adminT("admin.ui.0562"), icon: Truck, placeholder: '15000', description: adminT("admin.ui.0563"), type: 'text' as const },

  { key: 'service_fee_rate', label: adminT("admin.ui.0564"), icon: DollarSign, placeholder: '10', description: adminT("admin.ui.0565"), type: 'text' as const },

  { key: 'default_address', label: adminT("admin.ui.0566"), icon: MapPin, placeholder: adminT("admin.ui.0567"), description: adminT("admin.ui.0568"), type: 'text' as const },

  { key: 'delivery_city', label: adminT("admin.ui.0569"), icon: MapPin, placeholder: adminT("admin.ui.0570"), description: adminT("admin.ui.0571"), type: 'text' as const },

  { key: 'delivery_area', label: adminT("admin.ui.0572"), icon: MapPin, placeholder: adminT("admin.ui.0573"), description: adminT("admin.ui.0574"), type: 'text' as const },

  { key: 'delivery_time', label: adminT("admin.ui.0575"), icon: Truck, placeholder: adminT("admin.ui.0321"), description: adminT("admin.ui.0576"), type: 'text' as const },

  { key: 'working_hours', label: adminT("admin.ui.0464"), icon: Truck, placeholder: '10:00-22:00', description: adminT("admin.ui.0577"), type: 'text' as const },

];
  return SETTING_FIELDS;
}



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

  'referral_enabled',

  'referral_promo_code',

  'referral_title',

  'referral_subtitle',

  'referral_share_text',

];



export default function AdminFoodSettings({ damAlemMode = false }: AdminFoodSettingsProps) {
  const { t: adminT, lang } = useLanguage();
  const adminLocale = lang === 'kz' ? 'kk-KZ' : 'ru-RU';
  const SETTING_FIELDS = getSETTING_FIELDS(adminT);


  const [settingsRows, setSettingsRows] = useState<SettingRow[]>([]);

  const [values, setValues] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [settingsTab, setSettingsTab] = useState<SettingsTab>('delivery');



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
      if (!vals.apartment_delivery_price) vals.apartment_delivery_price = '300';
      if (!vals.apartment_free_from) vals.apartment_free_from = vals.free_delivery_from;

      if (!vals.delivery_time) vals.delivery_time = adminT("admin.ui.0321");

      if (!vals.working_hours) vals.working_hours = '10:00-22:00';

      setValues(vals);



      const loadedStoreLat = parseFloat(vals.store_lat || '') || DEFAULT_STORE[0];
      const loadedStoreLng = parseFloat(vals.store_lng || '') || DEFAULT_STORE[1];
      setDeliveryZones(parseDeliveryZones(vals.delivery_zones, loadedStoreLat, loadedStoreLng));

      setStoreLat(loadedStoreLat);

      setStoreLng(loadedStoreLng);

      setOutsideZoneMessage(vals.outside_zone_message || '');



      setLoyaltyGifts(parseLoyaltyGifts(vals.loyalty_gifts));

      setLoyaltyEnabled(vals.loyalty_enabled !== '0' && vals.loyalty_enabled !== 'false');

      setPromoCodes(parsePromoCodes(vals.promo_codes));
      if (!vals.referral_enabled) vals.referral_enabled = '1';
      if (!vals.referral_promo_code) vals.referral_promo_code = 'DAMALEM10';
      if (!vals.referral_title) vals.referral_title = 'Отправить другу — скидка 10%';
      if (!vals.referral_subtitle) vals.referral_subtitle = 'Друг получает код DAMALEM10 на заказ от 2 500 ₸';
      if (!vals.referral_share_text) {
        vals.referral_share_text = 'Привет! Заказываю в DAM ALEM 2.0 — доставка по Сортировке.\nПромокод DAMALEM10 — скидка 10% на заказ от 2 500 ₸';
      }
      setValues(vals);

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

      toast.error(adminT("admin.ui.0581"));

    } finally {

      setLoading(false);

    }

  }



  async function saveSettings() {
    const numericKeys = [
      'min_order_amount',
      'delivery_price',
      'free_delivery_from',
      'apartment_delivery_price',
      'apartment_free_from',
      'service_fee_rate',
    ];
    for (const key of numericKeys) {
      const raw = values[key];
      if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
        toast.error(adminT("admin.ui.0582"));
        return;
      }
    }
    const normalizedCodes = promoCodes.map((promo) => promo.code.trim().toUpperCase()).filter(Boolean);
    if (new Set(normalizedCodes).size !== normalizedCodes.length) {
      toast.error(adminT("admin.ui.0583"));
      return;
    }
    const invalidPromo = promoCodes.find((promo) =>
      !promo.code.trim() ||
      promo.value < 0 ||
      (promo.valid_from && promo.valid_until && promo.valid_from > promo.valid_until),
    );
    if (invalidPromo) {
      toast.error(adminT("admin.ui.0584"));
      return;
    }
    if (loyaltyEnabled && loyaltyGifts.some((gift) => !gift.title.trim() || gift.min_amount <= 0)) {
      toast.error(adminT("admin.ui.0585"));
      return;
    }

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

      toast.success(adminT("admin.ui.0586"));

      invalidateAllCaches();

      loadSettings();

    } catch (e) {

      console.error(e);

      toast.error(adminT("admin.ui.0055"));

    } finally {

      setSaving(false);

    }

  }



  function loadDefaultPromoSlides() {
    const freeFrom = Number(values.free_delivery_from || 15000).toLocaleString(adminLocale);
    const giftFrom = Math.min(
      ...loyaltyGifts.filter((gift) => gift.is_active).map((gift) => gift.min_amount),
    );
    const giftAmount = Number.isFinite(giftFrom) ? giftFrom.toLocaleString(adminLocale) : '5 000';

    setPromoSlides([

      { title: 'Бесплатно до квартиры', lines: [`При заказе от ${freeFrom} ₸`, 'Доставка и подъём до двери', 'Порог задаётся в настройках'] },

      { title: `Подарок от ${giftAmount} ₸`, lines: ['Клиент выбирает один подарок', 'Подарок добавляется бесплатно', 'Виден в заказе администратора'] },

      { title: 'Новинки меню', lines: ['Попробуйте первыми', 'Свежие блюда', 'Каждую неделю'] },

    ]);

  }



  function loadDefaultGifts() {

    setLoyaltyGifts([

      { ...newLoyaltyGift(0), min_amount: 5000, title: 'Картофель фри', description: 'Один из подарков на выбор', is_active: true },

      { ...newLoyaltyGift(1), min_amount: 5000, title: 'Напиток 0,5 л', description: 'Один из подарков на выбор', is_active: true },

      { ...newLoyaltyGift(2), min_amount: 5000, title: 'Соус на выбор', description: 'Один из подарков на выбор', is_active: true },

      { ...newLoyaltyGift(3), min_amount: 10000, title: 'Десерт дня', description: 'Следующий уровень подарка', is_active: true },

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

        <h3 className="font-bold text-lg">{damAlemMode ? adminT("admin.ui.0603") : adminT("admin.ui.0604")}</h3>

        <Button onClick={saveSettings} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">

          <Save className="w-4 h-4 mr-1" /> {saving ? adminT("admin.ui.0328") : adminT("admin.ui.0605")}

        </Button>

      </div>



      <div className="flex flex-wrap gap-2">

        {tabBtn('delivery', adminT("admin.ui.0606"), Truck)}

        {tabBtn('promo', adminT("admin.ui.0607"), Megaphone)}

        {tabBtn('gifts', adminT("admin.ui.0608"), Gift)}

        {tabBtn('zones', adminT("admin.ui.0609"), MapPin)}

        {tabBtn('general', adminT("admin.ui.0610"), Sparkles)}

      </div>



      {settingsTab === 'delivery' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-orange-950">
            <p className="font-semibold">{adminT("admin.ui.0611")}</p>
            <p className="mt-1 text-orange-900/80">
              {adminT("admin.ui.0612")} </p>
          </div>
          {SETTING_FIELDS.filter(field => DELIVERY_KEYS.includes(field.key)).map(field => {
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
      )}

      {settingsTab === 'promo' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-orange-950">
            <p className="font-semibold">{adminT("admin.ui.0613")}</p>
            <p className="mt-1 text-orange-900/80">
              {adminT("admin.ui.0614")} </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <FoodPromoCodesEditor codes={promoCodes} onChange={setPromoCodes} />
          </div>
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-gray-900">{adminT("admin.ui.0615")}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{adminT("admin.ui.0616")}</p>
              </div>
              <button
                type="button"
                onClick={() => setValues(prev => ({
                  ...prev,
                  referral_enabled: prev.referral_enabled === '0' ? '1' : '0',
                }))}
                className="text-sm font-semibold text-orange-600"
              >
                {values.referral_enabled === '0' ? adminT("admin.ui.0617") : adminT("admin.ui.0618")}
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">{adminT("admin.ui.0619")}</label>
              <Input
                value={values.referral_promo_code || 'DAMALEM10'}
                onChange={e => setValues(prev => ({ ...prev, referral_promo_code: e.target.value.toUpperCase() }))}
                placeholder="DAMALEM10"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">{adminT("admin.ui.0302")}</label>
              <Input
                value={values.referral_title || ''}
                onChange={e => setValues(prev => ({ ...prev, referral_title: e.target.value }))}
                placeholder={adminT("admin.ui.0578")}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">{adminT("admin.ui.0620")}</label>
              <Input
                value={values.referral_subtitle || ''}
                onChange={e => setValues(prev => ({ ...prev, referral_subtitle: e.target.value }))}
                placeholder={adminT("admin.ui.0621")}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">{adminT("admin.ui.0622")}</label>
              <Textarea
                value={values.referral_share_text || ''}
                onChange={e => setValues(prev => ({ ...prev, referral_share_text: e.target.value }))}
                rows={3}
                placeholder={adminT("admin.ui.0623")}
              />
            </div>
          </div>
        </div>
      )}

      {settingsTab === 'zones' && (

        <div className="space-y-4">

          <div className="rounded-xl border bg-white p-4">

            <h4 className="font-semibold text-gray-900 mb-1">{adminT("admin.ui.0624")}</h4>

            <p className="text-xs text-gray-500 mb-4">

              {adminT("admin.ui.0625")} </p>

            <DeliveryZoneEditor

              zones={deliveryZones}

              storeLat={storeLat}

              storeLng={storeLng}

              onZonesChange={setDeliveryZones}

              onStoreChange={(lat, lng) => { setStoreLat(lat); setStoreLng(lng); }}

            />

          </div>

          <div className="rounded-xl border bg-white p-4">

            <label className="text-sm font-medium text-gray-700 mb-1 block">{adminT("admin.ui.0626")}</label>

            <Textarea

              value={outsideZoneMessage}

              onChange={(e) => setOutsideZoneMessage(e.target.value)}

              rows={2}

              placeholder={adminT("admin.ui.0627")}

            />

          </div>

        </div>

      )}



      {settingsTab === 'gifts' && (

        <div className="space-y-4">

          <Button type="button" variant="outline" size="sm" onClick={loadDefaultGifts}>

            {adminT("admin.ui.0628")} </Button>

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

              <label className="text-sm font-medium text-gray-800">{adminT("admin.ui.0629")}</label>

            </div>

            <p className="mb-2 text-xs text-gray-500">{damAlemHeroBannerSizeHint()}</p>

            <ImageUpload value={heroImage} onChange={setHeroImage} folder="food" />

          </div>



          <div className="space-y-4">

            {SETTING_FIELDS.filter(field => !DELIVERY_KEYS.includes(field.key)).map(field => {

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

            <div className="mb-3 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <Megaphone className="h-4 w-4 text-orange-500" />

                <label className="text-sm font-medium text-gray-800">{adminT("admin.ui.0630")}</label>

              </div>

              <div className="flex gap-2">

                {promoSlides.length === 0 && (

                  <Button size="sm" variant="outline" onClick={loadDefaultPromoSlides} className="text-xs h-8">{adminT("admin.ui.0631")}</Button>

                )}

                <Button size="sm" variant="outline" onClick={addPromoSlide} className="text-xs h-8">

                  <Plus className="mr-1 h-3 w-3" /> {adminT("admin.ui.0632")} </Button>

              </div>

            </div>

            {promoSlides.length === 0 ? (

              <p className="text-center py-4 text-sm text-gray-400">{adminT("admin.ui.0633")}</p>

            ) : (

              <div className="space-y-3">

                {promoSlides.map((slide, idx) => (

                  <div key={idx} className="rounded-lg bg-gray-50 p-3 space-y-2">

                    <div className="flex gap-2">

                      <Input placeholder={adminT("admin.ui.0302")} value={slide.title} onChange={e => updatePromoSlide(idx, 'title', e.target.value)} className="flex-1" />

                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => removePromoSlide(idx)}><Trash2 className="h-4 w-4" /></Button>

                    </div>

                    {slide.lines.map((line, lineIdx) => (

                      <Input

                        key={lineIdx}

                        placeholder={adminT("admin.extra.1281").replace('{number}', () => String(lineIdx + 1))}

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

                  <label className="font-medium text-sm text-gray-800">{adminT("admin.ui.0634")}</label>

                  <p className="text-xs text-gray-400 mt-0.5">{adminT("admin.ui.0635")}</p>

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


