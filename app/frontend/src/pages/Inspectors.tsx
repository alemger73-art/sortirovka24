import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Search, Phone, MessageCircle, MapPin, ChevronLeft, Shield, User, Hash,
  Clock, Building2, Star, ChevronDown, ChevronUp, Copy, X, Map as MapIcon,
  List, Navigation, AlertTriangle
} from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Inspector {
  id: number;
  full_name: string;
  position?: string;
  photo_url?: string;
  precinct_number?: string;
  district?: string;
  address?: string;
  schedule?: string;
  phone?: string;
  whatsapp?: string;
  streets: string;
  description?: string;
  lat?: number;
  lng?: number;
  boundary_coords?: string;
  is_leadership?: boolean;
  leadership_order?: number;
}

type Tab = 'search' | 'map' | 'all';

const PRECINCT_COLORS = [
  '#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED',
  '#DB2777', '#0891B2', '#EA580C', '#4F46E5', '#0D9488',
];

const DEFAULT_CENTER: [number, number] = [51.1605, 71.4704];
const DEFAULT_ZOOM = 14;

function FlyToInspector({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.flyTo([lat, lng], 16, { duration: 0.8 });
  }, [lat, lng, map]);
  return null;
}

function parseBoundary(coords: string | undefined): [number, number][] | null {
  if (!coords) return null;
  try {
    const parsed = JSON.parse(coords);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.map((p: number[]) => [p[0], p[1]] as [number, number]);
    }
  } catch { /* ignore */ }
  return null;
}

async function copyPhone(phone: string, t: (key: string) => string) {
  try {
    await navigator.clipboard.writeText(phone);
    toast.success(t('common.copied'));
  } catch {
    toast.error(t('common.error'));
  }
}

function matchInspector(ins: Inspector, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const streets = (ins.streets || '').toLowerCase();
  const name = ins.full_name.toLowerCase();
  const precinct = (ins.precinct_number || '').toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 1);
  return (
    words.some(w => streets.includes(w) || name.includes(w) || precinct.includes(w)) ||
    streets.includes(q) || name.includes(q) || precinct.includes(q)
  );
}

function sortByPrecinct(list: Inspector[]): Inspector[] {
  return [...list].sort((a, b) => {
    const na = parseInt(a.precinct_number || '999', 10);
    const nb = parseInt(b.precinct_number || '999', 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.full_name.localeCompare(b.full_name, 'ru');
  });
}

export default function InspectorsPage() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('street') || searchParams.get('q') || '');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { loadInspectors(); }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q) {
      setSearchParams({ q }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [searchQuery, setSearchParams]);

  async function loadInspectors() {
    setLoading(true);
    try {
      const res = await fetchWithCache(
        'inspectors_list',
        () => withRetry(() => client.entities.inspectors.query({ sort: 'precinct_number', limit: 100 })),
        2 * 60 * 1000
      );
      setInspectors(res.data?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const leadershipInspectors = useMemo(() =>
    inspectors.filter(ins => ins.is_leadership).sort((a, b) => (a.leadership_order || 0) - (b.leadership_order || 0)),
    [inspectors]
  );

  const regularInspectors = useMemo(() => sortByPrecinct(inspectors.filter(ins => !ins.is_leadership)), [inspectors]);

  const normalizeQuery = searchQuery.trim().toLowerCase();
  const hasSearched = normalizeQuery.length > 0;

  const matchedInspectors = useMemo(() => {
    if (!hasSearched) return [];
    return regularInspectors.filter(ins => matchInspector(ins, normalizeQuery));
  }, [regularInspectors, normalizeQuery, hasSearched]);

  const popularStreets = useMemo(() => {
    const seen = new Set<string>();
    const streets: string[] = [];
    for (const ins of regularInspectors) {
      for (const s of (ins.streets || '').split(',').map(x => x.trim()).filter(Boolean)) {
        const key = s.toLowerCase();
        if (!seen.has(key) && streets.length < 8) {
          seen.add(key);
          streets.push(s);
        }
      }
    }
    return streets;
  }, [regularInspectors]);

  const inspectorColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    inspectors.forEach((ins, idx) => { map[ins.id] = PRECINCT_COLORS[idx % PRECINCT_COLORS.length]; });
    return map;
  }, [inspectors]);

  const mappableInspectors = regularInspectors.filter(ins => ins.lat && ins.lng);
  const hasMapData = mappableInspectors.length > 0;
  const selectedInspector = selectedId ? inspectors.find(i => i.id === selectedId) : null;

  const mapCenter = useMemo<[number, number]>(() => {
    if (selectedInspector?.lat && selectedInspector?.lng) return [selectedInspector.lat, selectedInspector.lng];
    if (mappableInspectors.length === 0) return DEFAULT_CENTER;
    const avgLat = mappableInspectors.reduce((s, i) => s + (i.lat || 0), 0) / mappableInspectors.length;
    const avgLng = mappableInspectors.reduce((s, i) => s + (i.lng || 0), 0) / mappableInspectors.length;
    return [avgLat, avgLng];
  }, [mappableInspectors, selectedInspector]);

  const selectInspector = useCallback((id: number, scroll = false) => {
    setSelectedId(id);
    if (scroll) {
      setTimeout(() => cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, []);

  const clearSearch = () => {
    setSearchQuery('');
    setSelectedId(null);
    setActiveTab('search');
  };

  return (
    <Layout>
      {/* Hero — компактный, фокус на поиске */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-4 pt-8 pb-10">
          <Link to="/directory" className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white mb-5 transition-colors">
            <ChevronLeft className="w-4 h-4" /> {t('inspectors.backToDirectory')}
          </Link>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">{t('inspectors.title')}</h1>
              <p className="text-sm text-white/45 mt-0.5">{t('inspectors.district')}</p>
            </div>
          </div>

          {/* Шаги */}
          <div className="flex items-center gap-2 mb-6 text-xs text-white/40">
            <span className="flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1 border border-white/10">
              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">1</span>
              {t('inspectors.step1')}
            </span>
            <span className="text-white/20">→</span>
            <span className="flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1 border border-white/10">
              <span className="w-5 h-5 rounded-full bg-blue-500/60 text-white text-[10px] font-bold flex items-center justify-center">2</span>
              {t('inspectors.step2')}
            </span>
            <span className="text-white/20 hidden sm:inline">→</span>
            <span className="hidden sm:flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1 border border-white/10">
              <span className="w-5 h-5 rounded-full bg-blue-500/40 text-white text-[10px] font-bold flex items-center justify-center">3</span>
              {t('inspectors.step3')}
            </span>
          </div>

          {/* Поиск */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
            <input
              type="search"
              placeholder={t('inspectors.searchPlaceholder')}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedId(null); }}
              className="w-full pl-12 pr-12 py-4 rounded-2xl bg-white text-gray-900 placeholder:text-gray-400 text-base font-medium shadow-xl shadow-black/20 outline-none ring-2 ring-transparent focus:ring-blue-400/50 transition-shadow"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-white/35 mt-2 ml-1">{t('inspectors.searchHint')}</p>
        </div>
      </section>

      {/* Экстренные — компактная полоска */}
      <div className="bg-red-600 text-white">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{t('inspectors.emergencyTitle')}:</span>
            <span className="sm:hidden">{t('inspectors.emergencyText')}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="tel:102" className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-sm font-bold transition-colors">102</a>
            <a href="tel:112" className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-sm font-bold transition-colors">112</a>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-gray-950 min-h-[60vh] pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto px-4 py-5">

          {/* Табы */}
          <div className="flex gap-1 p-1 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 mb-6">
            {([
              { id: 'search' as Tab, icon: Search, label: t('inspectors.tabSearch') },
              { id: 'map' as Tab, icon: MapIcon, label: t('inspectors.tabMap'), disabled: !hasMapData },
              { id: 'all' as Tab, icon: List, label: t('inspectors.tabAll') },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : tab.disabled
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden xs:inline sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Руководство — всегда сверху, компактно */}
          {leadershipInspectors.length > 0 && activeTab !== 'map' && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Star className="w-3.5 h-3.5" /> {t('inspectors.leadership')}
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {leadershipInspectors.map(ins => (
                  <LeadershipChip key={ins.id} inspector={ins} t={t} />
                ))}
              </div>
            </section>
          )}

          {loading ? (
            <LoadingState t={t} />
          ) : (
            <>
              {/* TAB: SEARCH */}
              {activeTab === 'search' && (
                <SearchTab
                  t={t}
                  hasSearched={hasSearched}
                  searchQuery={searchQuery}
                  matched={matchedInspectors}
                  popularStreets={popularStreets}
                  regularCount={regularInspectors.length}
                  selectedId={selectedId}
                  normalizeQuery={normalizeQuery}
                  inspectorColorMap={inspectorColorMap}
                  onStreetClick={s => { setSearchQuery(s); setActiveTab('search'); }}
                  onPrecinctClick={id => {
                    const ins = regularInspectors.find(i => i.id === id);
                    if (ins?.precinct_number) setSearchQuery(ins.precinct_number);
                    selectInspector(id);
                  }}
                  onShowAll={() => setActiveTab('all')}
                  onClear={clearSearch}
                  cardRefs={cardRefs}
                  precincts={regularInspectors}
                />
              )}

              {/* TAB: MAP */}
              {activeTab === 'map' && hasMapData && (
                <MapTab
                  t={t}
                  inspectors={regularInspectors}
                  mappable={mappableInspectors}
                  selectedId={selectedId}
                  selectedInspector={selectedInspector}
                  inspectorColorMap={inspectorColorMap}
                  mapCenter={mapCenter}
                  onSelect={selectInspector}
                />
              )}

              {/* TAB: ALL */}
              {activeTab === 'all' && (
                <AllTab
                  t={t}
                  inspectors={regularInspectors}
                  selectedId={selectedId}
                  normalizeQuery={normalizeQuery}
                  inspectorColorMap={inspectorColorMap}
                  onSelect={id => selectInspector(id, true)}
                  cardRefs={cardRefs}
                />
              )}
            </>
          )}

          {/* Справка */}
          {activeTab !== 'map' && (
            <InfoBlock t={t} />
          )}
        </div>
      </div>

      {/* Sticky call bar — mobile, when inspector selected */}
      {selectedInspector && !selectedInspector.is_leadership && (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{selectedInspector.full_name}</p>
              <p className="text-xs text-gray-500">{selectedInspector.phone || t('common.noPhone')}</p>
            </div>
            {selectedInspector.phone ? (
              <a
                href={`tel:${selectedInspector.phone}`}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl text-sm shadow-lg"
              >
                <Phone className="w-4 h-4" /> {t('common.call')}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="flex items-center gap-2 bg-gray-200 dark:bg-gray-800 text-gray-500 font-bold px-5 py-3 rounded-xl text-sm cursor-not-allowed"
                title={t('common.noPhone')}
              >
                <Phone className="w-4 h-4" /> {t('common.call')}
              </button>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

/* ─── Sub-components ─── */

function LoadingState({ t }: { t: (k: string) => string }) {
  return (
    <div className="text-center py-20">
      <div className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-gray-400 mt-4 text-sm">{t('common.loading')}</p>
    </div>
  );
}

function InfoBlock({ t }: { t: (k: string) => string }) {
  return (
    <div className="mt-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5">
      <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-600" /> {t('inspectors.whatDoes')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(['duty1', 'duty2', 'duty3', 'duty4', 'duty5', 'duty6'] as const).map(key => (
          <div key={key} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
            {t(`inspectors.${key}`)}
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadershipChip({ inspector: ins, t }: { inspector: Inspector; t: (k: string) => string }) {
  return (
    <div className="flex-shrink-0 w-64 bg-white dark:bg-gray-900 rounded-2xl border border-amber-200/60 dark:border-amber-900/40 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/30 overflow-hidden ring-2 ring-amber-100 flex-shrink-0">
          {ins.photo_url ? (
            <StorageImg objectKey={ins.photo_url} alt={ins.full_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><User className="w-5 h-5 text-amber-400" /></div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{ins.full_name}</p>
          <p className="text-[10px] text-amber-600 font-medium uppercase">{ins.position || t('inspectors.leadership')}</p>
        </div>
      </div>
      {ins.phone ? (
        <a href={`tel:${ins.phone}`} className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2 rounded-xl">
          <Phone className="w-3.5 h-3.5" /> {ins.phone}
        </a>
      ) : (
        <div className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-sm font-bold py-2 rounded-xl text-center">
          {t('common.noPhone')}
        </div>
      )}
    </div>
  );
}

function FeaturedInspector({
  inspector: ins,
  t,
  color,
  highlight,
}: {
  inspector: Inspector;
  t: (k: string) => string;
  color: string;
  highlight: string;
}) {
  const streets = (ins.streets || '').split(',').map(s => s.trim()).filter(Boolean);

  return (
    <div className="rounded-3xl overflow-hidden shadow-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 mb-6">
      <div className="h-2" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      <div className="p-5 md:p-6">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">{t('inspectors.yourInspector')}</p>

        <div className="flex gap-4 mb-5">
          <div className="w-24 h-24 rounded-2xl overflow-hidden ring-4 ring-white shadow-lg flex-shrink-0" style={{ boxShadow: `0 0 0 3px ${color}33` }}>
            {ins.photo_url ? (
              <StorageImg objectKey={ins.photo_url} alt={ins.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-blue-50 flex items-center justify-center"><User className="w-10 h-10 text-blue-300" /></div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight mb-1">{ins.full_name}</h2>
            {ins.position && <p className="text-sm text-gray-500 mb-2">{ins.position}</p>}
            {ins.precinct_number && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: color }}>
                <Hash className="w-3 h-3" /> {t('inspectors.precinct')} {ins.precinct_number}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-sm">
          {ins.address && (
            <div className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
              <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold">{t('inspectors.reception')}</p>
                <p className="text-gray-700 dark:text-gray-300 text-xs">{ins.address}</p>
              </div>
            </div>
          )}
          {ins.schedule && (
            <div className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
              <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold">{t('inspectors.reception')}</p>
                <p className="text-gray-700 dark:text-gray-300 text-xs">{ins.schedule}</p>
              </div>
            </div>
          )}
        </div>

        {streets.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('inspectors.streets')}</p>
            <div className="flex flex-wrap gap-1.5">
              {streets.slice(0, 6).map((street, i) => (
                <span key={i} className={`text-xs px-2 py-1 rounded-lg ${highlight && street.toLowerCase().includes(highlight) ? 'bg-blue-100 text-blue-800 font-semibold' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {street}
                </span>
              ))}
              {streets.length > 6 && <span className="text-xs text-gray-400 px-2 py-1">+{streets.length - 6}</span>}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {ins.phone ? (
            <a href={`tel:${ins.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-blue-600/25 transition-all active:scale-[0.98]">
              <Phone className="w-5 h-5" /> {ins.phone}
            </a>
          ) : (
            <button type="button" disabled className="flex-1 flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-800 text-gray-500 font-bold py-4 rounded-2xl text-base cursor-not-allowed">
              <Phone className="w-5 h-5" /> {t('common.noPhone')}
            </button>
          )}
          {ins.whatsapp && (
            <a href={`https://wa.me/${ins.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-4 rounded-2xl">
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
          <button
            onClick={() => ins.phone && copyPhone(ins.phone, t)}
            disabled={!ins.phone}
            className={`w-14 flex items-center justify-center rounded-2xl ${ins.phone ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-600' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'}`}
            title={ins.phone ? t('common.copy') : t('common.noPhone')}
          >
            <Copy className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchTab({
  t, hasSearched, searchQuery, matched, popularStreets, regularCount,
  selectedId, normalizeQuery, inspectorColorMap, onStreetClick, onPrecinctClick,
  onShowAll, onClear, cardRefs, precincts,
}: {
  t: (k: string) => string;
  hasSearched: boolean;
  searchQuery: string;
  matched: Inspector[];
  popularStreets: string[];
  regularCount: number;
  selectedId: number | null;
  normalizeQuery: string;
  inspectorColorMap: Record<number, string>;
  onStreetClick: (s: string) => void;
  onPrecinctClick: (id: number) => void;
  onShowAll: () => void;
  onClear: () => void;
  cardRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  precincts: Inspector[];
}) {
  if (!hasSearched) {
    return (
      <div>
        <div className="text-center py-8 mb-4">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Navigation className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{t('inspectors.startSearch')}</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">{t('inspectors.startSearchHint')}</p>
        </div>

        {popularStreets.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('inspectors.popularStreets')}</p>
            <div className="flex flex-wrap gap-2">
              {popularStreets.map(street => (
                <button
                  key={street}
                  onClick={() => onStreetClick(street)}
                  className="text-sm px-4 py-2 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all font-medium shadow-sm"
                >
                  {street}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('inspectors.browseByPrecinct')}</p>
          <p className="text-xs text-gray-400 mb-3">{t('inspectors.tapPrecinct')}</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {precincts.map(ins => {
              const color = inspectorColorMap[ins.id];
              return (
                <button
                  key={ins.id}
                  onClick={() => onPrecinctClick(ins.id)}
                  className="aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 hover:border-blue-400 hover:shadow-md transition-all active:scale-95"
                  style={{ borderTopColor: color, borderTopWidth: 3 }}
                >
                  <span className="text-lg font-black text-gray-900 dark:text-white">{ins.precinct_number || '?'}</span>
                  <span className="text-[9px] text-gray-400 truncate max-w-full px-1">{ins.full_name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={onShowAll} className="w-full py-3 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
          {t('inspectors.viewAll')} ({regularCount})
        </button>
      </div>
    );
  }

  if (matched.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Search className="w-8 h-8 text-gray-300" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('inspectors.notFound')}</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">{t('inspectors.tryAnother')}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={onClear} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold">{t('inspectors.showAll')}</button>
          <button onClick={onShowAll} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400">{t('inspectors.browseByPrecinct')}</button>
        </div>
      </div>
    );
  }

  if (matched.length === 1) {
    return (
      <FeaturedInspector
        inspector={matched[0]}
        t={t}
        color={inspectorColorMap[matched[0].id]}
        highlight={normalizeQuery}
      />
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        <span className="font-bold text-gray-900 dark:text-white">{matched.length}</span> {t('inspectors.foundByQuery')} «{searchQuery}»
      </p>
      <div className="space-y-3">
        {matched.map(ins => (
          <div key={ins.id} ref={el => { cardRefs.current[ins.id] = el; }}>
            <InspectorCard
              inspector={ins}
              highlight={normalizeQuery}
              isSelected={selectedId === ins.id}
              color={inspectorColorMap[ins.id]}
              t={t}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AllTab({
  t, inspectors, selectedId, normalizeQuery, inspectorColorMap, onSelect, cardRefs,
}: {
  t: (k: string) => string;
  inspectors: Inspector[];
  selectedId: number | null;
  normalizeQuery: string;
  inspectorColorMap: Record<number, string>;
  onSelect: (id: number) => void;
  cardRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
}) {
  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {t('inspectors.allInspectors')} <span className="font-bold text-gray-900 dark:text-white">{inspectors.length}</span>
      </p>
      <div className="space-y-3">
        {inspectors.map(ins => (
          <div key={ins.id} ref={el => { cardRefs.current[ins.id] = el; }} onClick={() => onSelect(ins.id)}>
            <InspectorCard
              inspector={ins}
              highlight={normalizeQuery}
              isSelected={selectedId === ins.id}
              color={inspectorColorMap[ins.id]}
              t={t}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MapTab({
  t, inspectors, mappable, selectedId, selectedInspector, inspectorColorMap, mapCenter, onSelect,
}: {
  t: (k: string) => string;
  inspectors: Inspector[];
  mappable: Inspector[];
  selectedId: number | null;
  selectedInspector: Inspector | null | undefined;
  inspectorColorMap: Record<number, string>;
  mapCenter: [number, number];
  onSelect: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 text-center">{t('inspectors.mapHint')}</p>

      <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-lg bg-white dark:bg-gray-900">
        <div className="h-[55vh] min-h-[320px] max-h-[500px] relative z-0">
          <MapContainer center={mapCenter} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full">
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {selectedInspector?.lat && selectedInspector?.lng && (
              <FlyToInspector lat={selectedInspector.lat} lng={selectedInspector.lng} />
            )}
            {inspectors.map(ins => {
              const boundary = parseBoundary(ins.boundary_coords);
              if (!boundary) return null;
              const color = inspectorColorMap[ins.id];
              const isSelected = selectedId === ins.id;
              return (
                <Polygon
                  key={`p-${ins.id}`}
                  positions={boundary}
                  pathOptions={{
                    color: isSelected ? '#1D4ED8' : color,
                    fillColor: color,
                    fillOpacity: isSelected ? 0.4 : 0.18,
                    weight: isSelected ? 3 : 1.5,
                  }}
                  eventHandlers={{ click: () => onSelect(ins.id) }}
                />
              );
            })}
            {mappable.map(ins => (
              <Marker key={`m-${ins.id}`} position={[ins.lat!, ins.lng!]} eventHandlers={{ click: () => onSelect(ins.id) }}>
                <Popup>
                  <p className="font-bold text-sm">{ins.full_name}</p>
                  {ins.precinct_number && <p className="text-xs text-blue-600">№{ins.precinct_number}</p>}
                  <a href={`tel:${ins.phone}`} className="text-xs text-blue-600 font-semibold">{ins.phone}</a>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="p-3 border-t border-gray-100 dark:border-gray-800 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {mappable.map(ins => {
              const color = inspectorColorMap[ins.id];
              const active = selectedId === ins.id;
              return (
                <button
                  key={ins.id}
                  onClick={() => onSelect(ins.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                    active ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: active ? '#fff' : color }} />
                  №{ins.precinct_number || '?'}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedInspector && !selectedInspector.is_leadership && (
        <InspectorCard
          inspector={selectedInspector}
          highlight=""
          isSelected
          color={inspectorColorMap[selectedInspector.id]}
          t={t}
        />
      )}
    </div>
  );
}

function InspectorCard({
  inspector: ins,
  highlight,
  isSelected,
  color,
  t,
  compact = false,
}: {
  inspector: Inspector;
  highlight: string;
  isSelected: boolean;
  color: string;
  t: (k: string) => string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const streetsList = (ins.streets || '').split(',').map(s => s.trim()).filter(Boolean);

  if (compact) {
    return (
      <div
        className={`rounded-2xl bg-white dark:bg-gray-900 border overflow-hidden transition-all cursor-pointer ${
          isSelected ? 'border-blue-400 shadow-lg ring-2 ring-blue-100 dark:ring-blue-900/40' : 'border-gray-100 dark:border-gray-800 hover:shadow-md'
        }`}
      >
        <div className="flex items-center gap-3 p-4">
          <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            {ins.photo_url ? (
              <StorageImg objectKey={ins.photo_url} alt={ins.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-gray-300" /></div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 dark:text-white truncate">{ins.full_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {ins.precinct_number && (
                <span className="text-xs font-semibold text-gray-500">№{ins.precinct_number}</span>
              )}
              <span className="text-xs text-gray-400 truncate">{streetsList.slice(0, 2).join(', ')}</span>
            </div>
          </div>
          {ins.phone ? (
            <a
              href={`tel:${ins.phone}`}
              onClick={e => e.stopPropagation()}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md"
              title={t('common.call')}
            >
              <Phone className="w-4 h-4" />
            </a>
          ) : (
            <div
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-400 flex items-center justify-center"
              title={t('common.noPhone')}
            >
              <Phone className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-white dark:bg-gray-900 border overflow-hidden ${isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100'}`}>
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-5">
        <div className="flex gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0">
            {ins.photo_url ? (
              <StorageImg objectKey={ins.photo_url} alt={ins.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-blue-50 flex items-center justify-center"><User className="w-8 h-8 text-blue-300" /></div>
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">{ins.full_name}</h3>
            {ins.precinct_number && <p className="text-sm text-gray-500 mt-0.5">№{ins.precinct_number} · {ins.district}</p>}
          </div>
        </div>

        <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-600 font-semibold flex items-center gap-1 mb-3">
          {expanded ? <><ChevronUp className="w-3 h-3" /> {t('inspectors.hideDetails')}</> : <><ChevronDown className="w-3 h-3" /> {t('inspectors.details')}</>}
        </button>

        {expanded && (
          <div className="mb-4 space-y-2 text-sm text-gray-500">
            {ins.address && <p className="flex gap-2"><Building2 className="w-4 h-4 flex-shrink-0" />{ins.address}</p>}
            {ins.schedule && <p className="flex gap-2"><Clock className="w-4 h-4 flex-shrink-0" />{ins.schedule}</p>}
            <div className="flex flex-wrap gap-1">
              {streetsList.map((s, i) => (
                <span key={i} className={`text-xs px-2 py-0.5 rounded ${highlight && s.toLowerCase().includes(highlight) ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'}`}>{s}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {ins.phone ? (
            <a href={`tel:${ins.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 rounded-xl text-sm">
              <Phone className="w-4 h-4" /> {t('common.call')}
            </a>
          ) : (
            <button type="button" disabled className="flex-1 flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-800 text-gray-500 font-bold py-3 rounded-xl text-sm cursor-not-allowed">
              <Phone className="w-4 h-4" /> {t('common.noPhone')}
            </button>
          )}
          {ins.whatsapp && (
            <a href={`https://wa.me/${ins.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="px-4 flex items-center justify-center bg-green-500 text-white rounded-xl">
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => ins.phone && copyPhone(ins.phone, t)}
            disabled={!ins.phone}
            className={`w-12 flex items-center justify-center rounded-xl ${ins.phone ? 'bg-gray-100' : 'bg-gray-200 dark:bg-gray-800 cursor-not-allowed'}`}
            title={ins.phone ? t('common.copy') : t('common.noPhone')}
          >
            <Copy className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
