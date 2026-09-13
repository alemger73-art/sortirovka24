import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import TaxiLiveMap from '@/components/taxi/TaxiLiveMap';
import TaxiAddressInput from '@/components/taxi/TaxiAddressInput';
import TaxiUnavailable from '@/components/taxi/TaxiUnavailable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GeolocationError, requestCurrentPosition } from '@/lib/geolocation';
import { getAccountToken } from '@/lib/accountApi';
import { getAccountPrefill } from '@/lib/localAuth';
import {
  formatTenge,
  taxiApi,
  type TaxiQuote,
  type TaxiRide,
  type TaxiSettings,
} from '@/lib/taxiApi';
import {
  AlertCircle,
  ArrowRight,
  Car,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Phone,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';

const FROM_EXAMPLES = [{ value: "ул. Жекибаева 129", labelKey: 'public.taxi.addressExample.zhekibayev' }, { value: "мкр. Сортировка, дом 5", labelKey: 'public.taxi.addressExample.sortirovka' }, { value: "пер. Урановый 10", labelKey: 'public.taxi.addressExample.uranovy' }];
const TO_EXAMPLES = [{ value: "Центр Караганды", labelKey: 'public.taxi.addressExample.centre' }, { value: "Ж/Д вокзал", labelKey: 'public.taxi.addressExample.station' }, { value: "уранова 10", labelKey: 'public.taxi.addressExample.uranova' }];

type PointKind = 'from' | 'to';

export default function Taxi() {
  const { t: publicT } = useLanguage();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<TaxiSettings | null>(null);
  const [fromAddress, setFromAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [toCoords, setToCoords] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [quote, setQuote] = useState<TaxiQuote | null>(null);
  const [loadingPoint, setLoadingPoint] = useState<PointKind | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [activeRide, setActiveRide] = useState<TaxiRide | null>(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [comment, setComment] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    taxiApi
      .settings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    if (getAccountToken()) {
      taxiApi
        .getActiveRide()
        .then((r) => {
          if (!cancelled && r) setActiveRide(r);
        })
        .catch(() => {});
    }
    const prefill = getAccountPrefill();
    if (prefill.name) setPassengerName((v) => v || prefill.name);
    if (prefill.phone) setPassengerPhone((v) => v || prefill.phone);
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveGps = useCallback(async (kind: PointKind) => {
    setLoadingPoint(kind);
    try {
      const coords = await requestCurrentPosition({ timeout: 12000 });
      const loc = await taxiApi.geocode({ lat: coords.lat, lng: coords.lng });
      if (!loc?.lat || !loc?.lng) {
        toast.error(publicT("public.Taxi.text226"));
        return;
      }
      if (kind === 'from') {
        setFromCoords(loc);
        setFromAddress(loc.address);
      } else {
        setToCoords(loc);
        setToAddress(loc.address);
      }
      setQuote(null);
    } catch (err) {
      if (err instanceof GeolocationError && err.code === 'denied') {
        toast.error(publicT("public.Taxi.text227"));
      } else {
        toast.error(publicT("public.Taxi.text228"));
      }
    } finally {
      setLoadingPoint(null);
    }
  }, [publicT]);

  const calculateQuote = useCallback(async () => {
    if (!fromCoords || !toCoords) {
      return;
    }
    setQuoting(true);
    try {
      const q = await taxiApi.quote({
        from_point: { lat: fromCoords.lat, lng: fromCoords.lng, address: fromCoords.address },
        to_point: { lat: toCoords.lat, lng: toCoords.lng, address: toCoords.address },
      });
      setQuote(q);
      if (!q.available) toast.error(q.message || publicT("public.Taxi.text229"));
    } catch (e: any) {
      toast.error(String(e?.message || publicT("public.Taxi.text230")));
    } finally {
      setQuoting(false);
    }
  }, [fromCoords, toCoords, publicT]);

  useEffect(() => {
    if (fromCoords && toCoords) calculateQuote();
  }, [fromCoords, toCoords, calculateQuote]);

  async function handleOrder() {
    if (!getAccountToken()) {
      navigate('/account?redirect=/taxi');
      return;
    }
    if (!quote?.available || !fromCoords || !toCoords) return;
    if (!passengerName.trim() || passengerPhone.trim().length < 10) {
      toast.error(publicT("public.Taxi.text231"));
      return;
    }
    setOrdering(true);
    try {
      const ride = await taxiApi.createRide({
        from_address: fromCoords.address,
        to_address: toCoords.address,
        from_lat: fromCoords.lat,
        from_lng: fromCoords.lng,
        to_lat: toCoords.lat,
        to_lng: toCoords.lng,
        passenger_name: passengerName.trim(),
        passenger_phone: passengerPhone.trim(),
        estimated_price: quote.price!,
        distance_km: quote.distance_km!,
        payment_method: paymentMethod,
        comment,
      });
      toast.success(publicT("public.Taxi.text232"));
      navigate(`/taxi/ride/${ride.id}`);
    } catch (e: any) {
      toast.error(String(e?.message || publicT("public.Taxi.text233")));
    } finally {
      setOrdering(false);
    }
  }

  if (settingsLoading && !settings && !activeRide) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex flex-col items-center justify-center gap-3 text-white/70">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
          <p className="text-sm">{publicT("public.Taxi.text234")}</p>
        </div>
      </Layout>
    );
  }
  if (activeRide) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg px-4 py-10 text-center">
          <div className="rounded-3xl bg-yellow-400 p-8 shadow-xl">
            <Car className="mx-auto h-12 w-12 text-gray-900 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">{publicT("public.Taxi.text235")}</h1>
            <p className="mt-2 text-gray-800">{activeRide.from_address} → {activeRide.to_address}</p>
            <Button
              className="mt-6 w-full h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
              onClick={() => navigate(`/taxi/ride/${activeRide.id}`)}
            >
              {publicT("public.Taxi.text236")} </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (settings && !settings.enabled) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 py-8">
          <TaxiUnavailable />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800">
        <div className="relative overflow-hidden px-4 pt-8 pb-6 md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(250,204,21,0.15),transparent_60%)]" />
          <div className="relative mx-auto max-w-3xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex shrink-0 h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400 shadow-lg shadow-yellow-400/20">
                <Car className="h-6 w-6 text-gray-900" />
              </div>
              <div className="min-w-0 break-words">
                <h1 className="text-3xl font-black text-white tracking-tight">Сортировка Такси</h1>
                <p className="text-yellow-400/90 text-sm font-medium">{publicT("public.Taxi.text237")}</p>
              </div>
            </div>
            {settings && (
              <p className="text-white/60 text-sm mt-3">
                {publicT("public.Taxi.text238")} {settings.service_area} {publicT("public.Taxi.text239")} {formatTenge(settings.min_fare)}
              </p>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-16 md:px-8 -mt-2">
          <div className="rounded-3xl bg-white shadow-2xl shadow-black/30 overflow-hidden">
            <TaxiLiveMap
              from={fromCoords ? { lat: fromCoords.lat, lng: fromCoords.lng } : null}
              to={toCoords ? { lat: toCoords.lat, lng: toCoords.lng } : null}
              centerLat={settings?.center_lat}
              centerLng={settings?.center_lng}
              height="220px"
            />

            <div className="p-5 md:p-6 space-y-5">
              <TaxiAddressInput
                label={publicT("public.DeliveryTrack.text183")}
                value={fromAddress}
                onChange={(v) => { setFromAddress(v); setFromCoords(null); setQuote(null); }}
                onResolved={(p) => { setFromCoords(p); setQuote(null); }}
                onGps={() => resolveGps('from')}
                loading={loadingPoint === 'from'}
                examples={FROM_EXAMPLES}
                accent="yellow"
                showGps
              />

              <div className="flex justify-center">
                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-gray-400 rotate-90" />
                </div>
              </div>

              <TaxiAddressInput
                label={publicT("public.DeliveryTrack.text184")}
                value={toAddress}
                onChange={(v) => { setToAddress(v); setToCoords(null); setQuote(null); }}
                onResolved={(p) => { setToCoords(p); setQuote(null); }}
                loading={loadingPoint === 'to'}
                examples={TO_EXAMPLES}
                accent="gray"
                showGps={false}
              />

              {quoting && (
                <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {publicT("public.Taxi.text240")} </div>
              )}

              {quote?.available && !quoting && (
                <div className="rounded-2xl bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-600">{publicT("public.extra.21")}</span>
                    <span className="text-3xl font-black text-gray-900">{formatTenge(quote.price!)}</span>
                  </div>
                  <div className="flex gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {quote.distance_km} {publicT("driver.km")}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{quote.eta_minutes} {publicT("public.Taxi.text241")}</span>
                    {quote.route_type === 'road' && <span className="text-green-700 text-xs">{publicT("public.Taxi.text242")}</span>}
                  </div>
                  {(quote.surge_multiplier ?? 1) > 1 && (
                    <p className="text-sm text-amber-800 font-medium">
                      {publicT("public.Taxi.text243")}{quote.surge_multiplier?.toFixed(1)}
                    </p>
                  )}
                  {quote.price_breakdown && (
                    <div className="text-xs text-gray-600 space-y-1 pt-1 border-t border-yellow-200/80">
                      <div className="flex justify-between"><span>{publicT("public.Taxi.text244")}</span><span>{formatTenge(quote.price_breakdown.base_fare)}</span></div>
                      <div className="flex justify-between"><span>{publicT("public.Taxi.text245")}{quote.price_breakdown.distance_km} {publicT("public.Taxi.text246")}</span><span>{formatTenge(quote.price_breakdown.distance_part)}</span></div>
                      <div className="flex justify-between"><span>{publicT("public.Taxi.text247")}{quote.price_breakdown.duration_min} {publicT("public.Taxi.text248")}</span><span>{formatTenge(quote.price_breakdown.time_part)}</span></div>
                      {(quote.price_breakdown.surge_part ?? 0) > 0 && (
                        <div className="flex justify-between text-amber-800"><span>{publicT("public.extra.22")}</span><span>+{formatTenge(quote.price_breakdown.surge_part)}</span></div>
                      )}
                    </div>
                  )}
                  {!showCheckout ? (
                    <Button
                      className="w-full h-13 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold text-base shadow-lg shadow-yellow-400/30"
                      onClick={() => {
                        if (!getAccountToken()) {
                          navigate('/account?redirect=/taxi');
                          return;
                        }
                        setShowCheckout(true);
                      }}
                    >
                      {publicT("public.Taxi.text249")} </Button>
                  ) : (
                    <div className="space-y-3 pt-2 border-t border-yellow-200">
                      <Input
                        value={passengerName}
                        onChange={(e) => setPassengerName(e.target.value)}
                        placeholder={publicT("realestate.form.author")}
                        className="rounded-xl h-11"
                      />
                      <Input
                        value={passengerPhone}
                        onChange={(e) => setPassengerPhone(e.target.value)}
                        placeholder={publicT("public.Taxi.text250")}
                        className="rounded-xl h-11"
                      />
                      <div className="flex gap-2">
                        {(['cash', 'card'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                              paymentMethod === m
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {m === 'cash' ? publicT("public.Taxi.text251") : publicT("public.Taxi.text252")}
                          </button>
                        ))}
                      </div>
                      <Input
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={publicT("public.CourierHub.text169")}
                        className="rounded-xl h-11"
                      />
                      <Button
                        className="w-full h-13 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
                        disabled={ordering}
                        onClick={handleOrder}
                      >
                        {ordering ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                        {publicT("public.Taxi.text253")} {formatTenge(quote.price!)}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {quote && !quote.available && !quoting && (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex gap-2 text-sm text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {quote.message}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Star, title: publicT("public.Taxi.text254"), desc: publicT("public.Taxi.text255") },
              { icon: Phone, title: publicT("public.Taxi.text256"), desc: publicT("public.Taxi.text257") },
              { icon: CheckCircle2, title: publicT("public.Taxi.text258"), desc: publicT("public.Taxi.text259") },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-white/5 border border-white/10 p-4 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-yellow-400 mb-2" />
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-white/50 text-xs mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-white/40 text-xs mt-6">
            {publicT("public.CourierHub.text172")} <Link to="/taxi/driver" className="underline hover:text-yellow-400">{publicT("public.Taxi.text260")}</Link>
            {' · '}
            {publicT("public.Taxi.text261")} <Link to="/transport" className="underline hover:text-yellow-400">{publicT("public.Taxi.text262")}</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

