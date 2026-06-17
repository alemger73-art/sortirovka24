import { MapPin, Navigation, Loader2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { DeliveryQuote } from '@/lib/gastronomDelivery';

const ADDRESS_EXAMPLES = [
  'ул. Жекибаева 129',
  'пер. Урановый 10',
  'мкр. Сортировка, дом 5',
];

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}

function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const pad = 0.008;
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <iframe
      title="Карта адреса"
      src={src}
      className="w-full h-36 rounded-xl border border-gray-200"
      loading="lazy"
    />
  );
}

interface Props {
  address: string;
  onAddressChange: (value: string) => void;
  hasDeliveryZones: boolean;
  deliveryQuote: DeliveryQuote | null;
  loading: boolean;
  error: string | null;
  onFindByAddress: () => void;
  onFindByGps: () => void;
  onSelectExample?: (example: string) => void;
  collapsed?: boolean;
  onEdit?: () => void;
  onContinueCheckout?: () => void;
  variant?: 'full' | 'compact';
}

export default function PharmacyDeliveryAddressPicker({
  address,
  onAddressChange,
  hasDeliveryZones,
  deliveryQuote,
  loading,
  error,
  onFindByAddress,
  onFindByGps,
  onSelectExample,
  collapsed = false,
  onEdit,
  onContinueCheckout,
  variant = 'full',
}: Props) {
  const trimmed = address.trim();
  const hasLocationWarning = !!deliveryQuote?.location_warning;
  const confirmed = deliveryQuote?.available === true && !hasLocationWarning;
  const failed = !loading && (error || hasLocationWarning || (deliveryQuote && !deliveryQuote.available));

  if (!hasDeliveryZones) {
    if (variant === 'compact') return null;
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-teal-600" />
          Адрес доставки
        </p>
        <Input
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Улица, дом, квартира"
          className="rounded-xl h-11"
        />
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex gap-2">
        <Input
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Улица, дом, квартира"
          className="rounded-xl bg-white flex-1 h-10"
          onKeyDown={(e) => e.key === 'Enter' && onFindByAddress()}
        />
        <Button
          type="button"
          onClick={onFindByGps}
          disabled={loading}
          className="shrink-0 h-10 px-3 bg-teal-600 hover:bg-teal-700"
          title="Определить по GPS"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onFindByAddress}
          disabled={loading || trimmed.length < 5}
          className="shrink-0 h-10 px-3"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (collapsed && confirmed && deliveryQuote) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-3 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0 text-sm font-bold">1</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-teal-900 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Адрес подтверждён
            </p>
            <p className="text-sm text-gray-800 mt-0.5 break-words">
              {deliveryQuote.display_address || trimmed}
            </p>
            <p className="text-xs text-teal-700 mt-1">
              {deliveryQuote.zone_name} · доставка {formatMoney(deliveryQuote.delivery_fee)}
            </p>
          </div>
          {onEdit && (
            <button type="button" onClick={onEdit} className="text-xs text-teal-700 font-medium underline shrink-0 py-1">
              Изменить
            </button>
          )}
        </div>
        {onContinueCheckout && (
          <Button
            type="button"
            onClick={onContinueCheckout}
            className="w-full h-12 bg-teal-600 hover:bg-teal-700 rounded-xl text-base font-semibold"
          >
            Шаг 2: Оформить заказ →
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4 shadow-sm">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0">1</span>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Шаг 1 из 2</span>
        </div>
        <p className="font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-teal-600" />
          Куда доставить?
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Проверьте адрес — затем перейдите к оформлению заказа
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onFindByGps}
          disabled={loading}
          className="flex items-center gap-3 p-3 rounded-xl border-2 border-teal-200 bg-teal-50/60 hover:bg-teal-50 transition-colors text-left disabled:opacity-60"
        >
          <span className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
          </span>
          <span>
            <span className="block text-sm font-semibold text-teal-900">Я здесь сейчас</span>
            <span className="block text-xs text-teal-700/80">Определить по GPS</span>
          </span>
        </button>
        <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50/50 text-left">
          <span className="w-10 h-10 rounded-full bg-white border flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-gray-500" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-gray-900">Знаю адрес</span>
            <span className="block text-xs text-gray-500">Введите ниже</span>
          </span>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        GPS на компьютере часто ошибается. Надёжнее — с телефона или введите адрес в Сортировке вручную
        (например: пер. Урановый 10).
      </p>

      <div className="space-y-2">
        <Input
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Например: пер. Урановый 10"
          className="rounded-xl h-11 text-base"
          onKeyDown={(e) => e.key === 'Enter' && trimmed.length >= 5 && onFindByAddress()}
        />
        <p className="text-[11px] text-gray-400">
          Формат: улица или переулок, номер дома
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ADDRESS_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                if (onSelectExample) onSelectExample(ex);
                else onAddressChange(ex);
              }}
              className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button
          type="button"
          onClick={onFindByAddress}
          disabled={loading || trimmed.length < 5}
          className="w-full h-11 bg-teal-600 hover:bg-teal-700 rounded-xl"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Ищем на карте...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Найти на карте
            </span>
          )}
        </Button>
      </div>

      {loading && (
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Проверяем «{trimmed || 'ваше местоположение'}»...
        </div>
      )}

      {!loading && confirmed && deliveryQuote && (
        <div className="space-y-3">
          <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-teal-900">Шаг 1 готов — доставим сюда!</p>
              {deliveryQuote.display_address && (
                <p className="text-xs text-teal-800/90 mt-0.5 break-words">{deliveryQuote.display_address}</p>
              )}
              <p className="text-sm text-teal-700 mt-1">
                {deliveryQuote.zone_name} · доставка {formatMoney(deliveryQuote.delivery_fee)}
              </p>
            </div>
          </div>
          {onContinueCheckout && (
            <Button
              type="button"
              onClick={onContinueCheckout}
              className="w-full h-12 bg-teal-600 hover:bg-teal-700 rounded-xl text-base font-semibold shadow-md"
            >
              Шаг 2: Оформить заказ →
            </Button>
          )}
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer py-1">Показать на карте</summary>
            {deliveryQuote.lat && deliveryQuote.lng && (
              <div className="mt-2">
                <MiniMap lat={deliveryQuote.lat} lng={deliveryQuote.lng} />
              </div>
            )}
          </details>
        </div>
      )}

      {!loading && failed && (
        <div className={`rounded-xl px-4 py-3 space-y-2 ${hasLocationWarning ? 'bg-amber-50 border border-amber-300' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex gap-3">
            <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${hasLocationWarning ? 'text-amber-600' : 'text-red-500'}`} />
            <div>
              <p className={`text-sm font-semibold ${hasLocationWarning ? 'text-amber-900' : 'text-red-900'}`}>
                {hasLocationWarning ? 'GPS показал другое место' : 'Адрес не подходит для доставки'}
              </p>
              <p className={`text-xs mt-1 ${hasLocationWarning ? 'text-amber-800' : 'text-red-700'}`}>
                {deliveryQuote?.location_warning || error || deliveryQuote?.message || 'Попробуйте GPS или уточните адрес'}
              </p>
              {deliveryQuote?.display_address && hasLocationWarning && (
                <p className="text-xs text-amber-700 mt-1 break-words">
                  Определено как: {deliveryQuote.display_address}
                  {deliveryQuote.distance_km != null && ` · ${deliveryQuote.distance_km} км от аптеки`}
                </p>
              )}
            </div>
          </div>
          {hasLocationWarning && deliveryQuote?.lat && deliveryQuote?.lng && (
            <MiniMap lat={deliveryQuote.lat} lng={deliveryQuote.lng} />
          )}
          {!hasLocationWarning && (
            <ul className="text-[11px] text-red-700/90 list-disc pl-5 space-y-0.5">
              <li>Аптека доставляет только в своей зоне на карте</li>
              <li>Или напишите адрес в зоне доставки вручную</li>
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={onFindByGps} className="h-9">
              <Navigation className="h-3.5 w-3.5 mr-1" /> GPS
            </Button>
            <Button type="button" size="sm" onClick={onFindByAddress} disabled={trimmed.length < 5} className="h-9 bg-teal-600 hover:bg-teal-700">
              {hasLocationWarning ? 'Ввести адрес' : 'Повторить'}
            </Button>
          </div>
        </div>
      )}

      {!loading && !confirmed && !failed && trimmed.length >= 5 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Нажмите «Найти на карте» или «Я здесь сейчас», чтобы проверить доставку
        </div>
      )}
    </div>
  );
}
