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
  /** compact = one line in header; full = cart / checkout block */
  variant?: 'full' | 'compact';
}

export default function DeliveryAddressPicker({
  address,
  onAddressChange,
  hasDeliveryZones,
  deliveryQuote,
  loading,
  error,
  onFindByAddress,
  onFindByGps,
  onSelectExample,
  variant = 'full',
}: Props) {
  const trimmed = address.trim();
  const confirmed = deliveryQuote?.available === true;
  const failed = !loading && (error || (deliveryQuote && !deliveryQuote.available));

  if (!hasDeliveryZones) {
    if (variant === 'compact') return null;
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-600" />
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
          className="shrink-0 h-10 px-3 bg-emerald-600 hover:bg-emerald-700"
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

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4 shadow-sm">
      <div>
        <p className="font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-emerald-600" />
          Куда доставить?
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Сначала проверим адрес на карте — так сразу покажем стоимость доставки
        </p>
      </div>

      {/* Шаг 1: два способа */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onFindByGps}
          disabled={loading}
          className="flex items-center gap-3 p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 transition-colors text-left disabled:opacity-60"
        >
          <span className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
          </span>
          <span>
            <span className="block text-sm font-semibold text-emerald-900">Я здесь сейчас</span>
            <span className="block text-xs text-emerald-700/80">Определить по GPS</span>
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

      {/* Шаг 2: ввод */}
      <div className="space-y-2">
        <Input
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Например: пер. Урановый 10"
          className="rounded-xl h-11 text-base"
          onKeyDown={(e) => e.key === 'Enter' && trimmed.length >= 5 && onFindByAddress()}
        />
        <p className="text-[11px] text-gray-400">
          Формат: улица или переулок, номер дома. Можно без «Алматы» — добавим сами.
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
              className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button
          type="button"
          onClick={onFindByAddress}
          disabled={loading || trimmed.length < 5}
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 rounded-xl"
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

      {/* Шаг 3: результат */}
      {loading && (
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Проверяем «{trimmed || 'ваше местоположение'}»...
        </div>
      )}

      {!loading && confirmed && deliveryQuote && (
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-900">Адрес найден — доставим!</p>
              {deliveryQuote.display_address && (
                <p className="text-xs text-emerald-800/90 mt-0.5 break-words">{deliveryQuote.display_address}</p>
              )}
              <p className="text-sm text-emerald-700 mt-1">
                {deliveryQuote.zone_name} · доставка {formatMoney(deliveryQuote.delivery_fee)}
              </p>
            </div>
          </div>
          {deliveryQuote.lat && deliveryQuote.lng && (
            <MiniMap lat={deliveryQuote.lat} lng={deliveryQuote.lng} />
          )}
        </div>
      )}

      {!loading && failed && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 space-y-2">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Не нашли адрес</p>
              <p className="text-xs text-red-700 mt-1">
                {error || deliveryQuote?.message || 'Попробуйте GPS или уточните адрес'}
              </p>
            </div>
          </div>
          <ul className="text-[11px] text-red-700/90 list-disc pl-5 space-y-0.5">
            <li>Нажмите «Я здесь сейчас» — это быстрее всего</li>
            <li>Или напишите короче: <strong>пер. Урановый 10</strong></li>
          </ul>
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={onFindByGps} className="h-9">
              <Navigation className="h-3.5 w-3.5 mr-1" /> GPS
            </Button>
            <Button type="button" size="sm" onClick={onFindByAddress} disabled={trimmed.length < 5} className="h-9 bg-emerald-600 hover:bg-emerald-700">
              Повторить
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
