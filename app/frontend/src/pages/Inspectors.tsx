import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import {
  Search, Phone, MessageCircle, MapPin, ChevronLeft, Shield, User, Hash,
  FileText, Map as MapIcon, List, Clock, Building2, Star, ChevronDown, ChevronUp
} from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon
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
  phone: string;
  whatsapp?: string;
  streets: string;
  description?: string;
  lat?: number;
  lng?: number;
  boundary_coords?: string;
  is_leadership?: boolean;
  leadership_order?: number;
}

// Predefined colors for precinct polygons
const PRECINCT_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

const DEFAULT_CENTER: [number, number] = [51.1605, 71.4704];
const DEFAULT_ZOOM = 14;

function FlyToInspector({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 16, { duration: 0.8 });
    }
  }, [lat, lng, map]);
  return null;
}

export default function InspectorsPage() {
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    loadInspectors();
  }, []);

  async function loadInspectors() {
    setLoading(true);
    try {
      const res = await fetchWithCache('inspectors_list', () => withRetry(() => client.entities.inspectors.query({ sort: 'precinct_number', limit: 100 })), 2 * 60 * 1000);
      setInspectors(res.data?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Separate leadership and regular inspectors
  const leadershipInspectors = useMemo(() =>
    inspectors
      .filter(ins => ins.is_leadership)
      .sort((a, b) => (a.leadership_order || 0) - (b.leadership_order || 0)),
    [inspectors]
  );

  const regularInspectors = useMemo(() =>
    inspectors.filter(ins => !ins.is_leadership),
    [inspectors]
  );

  // Search logic — search by name, streets, precinct number
  const normalizeQuery = searchQuery.trim().toLowerCase();
  const matchedInspectors = normalizeQuery
    ? regularInspectors.filter(ins => {
        const streets = ins.streets.toLowerCase();
        const name = ins.full_name.toLowerCase();
        const precinct = (ins.precinct_number || '').toLowerCase();
        const words = normalizeQuery.split(/\s+/).filter(w => w.length > 1);
        return (
          words.some(word => streets.includes(word) || name.includes(word) || precinct.includes(word)) ||
          streets.includes(normalizeQuery) ||
          name.includes(normalizeQuery)
        );
      })
    : showAll ? regularInspectors : [];

  const hasSearched = normalizeQuery.length > 0;

  // Inspectors that have map data
  const mappableInspectors = inspectors.filter(ins => ins.lat && ins.lng);
  const hasMapData = mappableInspectors.length > 0;

  // Parse boundary coordinates
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

  function handleMapInspectorClick(id: number) {
    setSelectedId(id);
    setViewMode('list');
    setTimeout(() => {
      const el = cardRefs.current[id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  // Compute map center from inspectors or use default
  const mapCenter = useMemo<[number, number]>(() => {
    if (mappableInspectors.length === 0) return DEFAULT_CENTER;
    const avgLat = mappableInspectors.reduce((s, i) => s + (i.lat || 0), 0) / mappableInspectors.length;
    const avgLng = mappableInspectors.reduce((s, i) => s + (i.lng || 0), 0) / mappableInspectors.length;
    return [avgLat, avgLng];
  }, [mappableInspectors]);

  const selectedInspector = selectedId ? inspectors.find(i => i.id === selectedId) : null;

  return (
    <Layout>
      {/* ── Hero section ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-400/15 rounded-full blur-[100px]" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-indigo-300/10 rounded-full blur-[80px]" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 pt-10 pb-12 md:pt-14 md:pb-16">
          <Link to="/directory" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white mb-6 transition-colors font-medium">
            <ChevronLeft className="w-4 h-4" /> Справочник
          </Link>

          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl rounded-full px-4 py-1.5 border border-white/15 mb-5">
            <Shield className="w-4 h-4 text-blue-200" />
            <span className="text-white/80 text-sm font-medium">Участковые инспекторы полиции</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-white mb-3 leading-tight">
            Ваш участковый рядом
          </h1>
          <p className="text-base md:text-lg text-white/50 mb-8 max-w-lg leading-relaxed">
            Введите улицу, ФИО или номер участка, чтобы найти инспектора
          </p>

          {/* Search bar */}
          <div className="max-w-xl">
            <div className="flex items-center bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/15 overflow-hidden ring-1 ring-white/20">
              <Search className="w-5 h-5 text-blue-500 ml-5 flex-shrink-0" />
              <input
                type="text"
                placeholder="Например: ул. Абая 25 или Иванов"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSelectedId(null);
                  if (e.target.value.trim()) setShowAll(false);
                  else setShowAll(true);
                }}
                className="flex-1 px-4 py-4 text-gray-800 placeholder:text-gray-400 bg-transparent outline-none text-base font-medium"
                autoFocus
              />
            </div>
          </div>

          {/* Quick info chips */}
          <div className="flex flex-wrap gap-2 mt-5">
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-200" />
              <span className="text-white/70 text-xs">{inspectors.length} участковых</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-green-300" />
              <span className="text-white/70 text-xs">Звоните бесплатно</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-white/70 text-xs">район Сортировка</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Content ── */}
      <div className="bg-gray-50 dark:bg-gray-950 min-h-[50vh]">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* ── Emergency Banner ── */}
          <div className="mb-6 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 rounded-2xl p-4 border border-red-100 dark:border-red-900/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">Экстренные ситуации</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  При угрозе жизни звоните <a href="tel:102" className="font-bold text-red-600 dark:text-red-400 hover:underline">102</a> (полиция) или{' '}
                  <a href="tel:112" className="font-bold text-red-600 dark:text-red-400 hover:underline">112</a> (единая служба спасения).
                  Участковый инспектор поможет с бытовыми вопросами, профилактикой и обращениями граждан.
                </p>
              </div>
            </div>
          </div>

          {/* ── Leadership Block ── */}
          {leadershipInspectors.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1.5 h-8 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">Руководство и контакты</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {leadershipInspectors.map(ins => (
                  <div
                    key={ins.id}
                    className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border border-amber-100 dark:border-amber-900/30 overflow-hidden"
                  >
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 px-5 py-3 border-b border-amber-100 dark:border-amber-900/30">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                          {ins.position || 'Руководство'}
                        </span>
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 flex items-center justify-center overflow-hidden shadow-sm ring-2 ring-amber-100 dark:ring-amber-900/30 flex-shrink-0">
                          {ins.photo_url ? (
                            <StorageImg objectKey={ins.photo_url} alt={ins.full_name} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-7 h-7 text-amber-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">{ins.full_name}</h3>
                          {ins.address && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                              <Building2 className="w-3 h-3 flex-shrink-0" /> {ins.address}
                            </p>
                          )}
                          {ins.schedule && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                              <Clock className="w-3 h-3 flex-shrink-0" /> {ins.schedule}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <a
                          href={`tel:${ins.phone}`}
                          className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-2.5 rounded-xl transition-all text-sm"
                        >
                          <Phone className="w-4 h-4" /> {ins.phone}
                        </a>
                        {ins.whatsapp && (
                          <a
                            href={`https://wa.me/${ins.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-3 py-2.5 rounded-xl transition-all text-sm"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* View mode toggle */}
          <div className="flex items-center justify-between mb-6">
            <div>
              {!hasSearched ? (
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Все участковые <span className="text-gray-400 font-medium text-base">({regularInspectors.length})</span>
                </h2>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {matchedInspectors.length > 0
                    ? <>Найдено <span className="font-bold text-gray-900 dark:text-white">{matchedInspectors.length}</span> участковых по запросу «{searchQuery}»</>
                    : <>По запросу «{searchQuery}» участковый не найден</>
                  }
                </p>
              )}
            </div>
            <div className="flex items-center bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                <List className="w-4 h-4" /> Список
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'map' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                <MapIcon className="w-4 h-4" /> Карта
              </button>
            </div>
          </div>

          {/* ── MAP VIEW ── */}
          {viewMode === 'map' && (
            <div className="mb-8">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="h-[450px] md:h-[550px] relative z-0">
                  <MapContainer
                    center={mapCenter}
                    zoom={DEFAULT_ZOOM}
                    scrollWheelZoom={true}
                    className="h-full w-full"
                    style={{ zIndex: 0 }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {selectedInspector?.lat && selectedInspector?.lng && (
                      <FlyToInspector lat={selectedInspector.lat} lng={selectedInspector.lng} />
                    )}

                    {/* Render polygons */}
                    {inspectors.map((ins, idx) => {
                      const boundary = parseBoundary(ins.boundary_coords);
                      if (!boundary) return null;
                      const color = PRECINCT_COLORS[idx % PRECINCT_COLORS.length];
                      const isSelected = selectedId === ins.id;
                      return (
                        <Polygon
                          key={`polygon-${ins.id}`}
                          positions={boundary}
                          pathOptions={{
                            color: isSelected ? '#1D4ED8' : color,
                            fillColor: color,
                            fillOpacity: isSelected ? 0.35 : 0.15,
                            weight: isSelected ? 3 : 2,
                          }}
                          eventHandlers={{
                            click: () => handleMapInspectorClick(ins.id),
                          }}
                        />
                      );
                    })}
                    {/* Render markers separately */}
                    {inspectors.map((ins) => {
                      if (!ins.lat || !ins.lng) return null;
                      return (
                        <Marker
                          key={`marker-${ins.id}`}
                          position={[ins.lat, ins.lng]}
                          eventHandlers={{
                            click: () => handleMapInspectorClick(ins.id),
                          }}
                        >
                          <Popup>
                            <div className="min-w-[200px]">
                              <p className="font-bold text-sm mb-1">{ins.full_name}</p>
                              {ins.position && (
                                <p className="text-xs text-gray-600 mb-1">{ins.position}</p>
                              )}
                              {ins.precinct_number && (
                                <p className="text-xs text-blue-600 mb-1">Участок №{ins.precinct_number}</p>
                              )}
                              <p className="text-xs text-gray-500 mb-2">{ins.streets.split(',').slice(0, 3).join(', ')}</p>
                              <a href={`tel:${ins.phone}`} className="text-xs text-blue-600 font-semibold">{ins.phone}</a>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                </div>

                {/* Map legend */}
                {mappableInspectors.length > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Участки</p>
                    <div className="flex flex-wrap gap-2">
                      {inspectors.filter(i => i.lat && i.lng).map((ins, idx) => (
                        <button
                          key={ins.id}
                          onClick={() => {
                            setSelectedId(ins.id);
                          }}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                            selectedId === ins.id
                              ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-blue-500" />
                          {ins.precinct_number ? `№${ins.precinct_number}` : ins.full_name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!hasMapData && (
                  <div className="px-4 py-6 text-center">
                    <MapPin className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 dark:text-gray-500">Координаты участков ещё не заданы</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Администратор может добавить координаты в панели управления</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-gray-400 mt-4 text-sm">Загрузка...</p>
            </div>
          ) : matchedInspectors.length === 0 && hasSearched ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Участковый не найден</h3>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">Попробуйте ввести другую улицу, ФИО или номер участка</p>
              <button
                onClick={() => { setSearchQuery(''); setShowAll(true); }}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold text-sm"
              >
                Показать всех участковых
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {matchedInspectors.map(ins => (
                <div
                  key={ins.id}
                  ref={el => { cardRefs.current[ins.id] = el; }}
                >
                  <InspectorCard
                    inspector={ins}
                    highlight={normalizeQuery}
                    isSelected={selectedId === ins.id}
                    onShowOnMap={() => {
                      setSelectedId(ins.id);
                      if (ins.lat && ins.lng) {
                        setViewMode('map');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Info block at bottom ── */}
          <div className="mt-10 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 md:p-6">
            <h3 className="font-bold text-gray-900 dark:text-white text-base mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Что делает участковый инспектор?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Профилактика правонарушений на участке</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Приём заявлений и обращений граждан</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Разрешение бытовых конфликтов</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Контроль за общественным порядком</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Работа с неблагополучными семьями</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Проведение профилактических бесед</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ── Inspector Card (enhanced) ── */
function InspectorCard({
  inspector,
  highlight,
  isSelected,
  onShowOnMap,
}: {
  inspector: Inspector;
  highlight: string;
  isSelected: boolean;
  onShowOnMap: () => void;
}) {
  const ins = inspector;
  const [expanded, setExpanded] = useState(false);
  const streetsList = ins.streets.split(',').map(s => s.trim()).filter(Boolean);
  const displayStreets = expanded ? streetsList : streetsList.slice(0, 5);
  const moreCount = streetsList.length - 5;

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border overflow-hidden ${
      isSelected ? 'border-blue-400 ring-2 ring-blue-100 dark:ring-blue-900/40 shadow-blue-100' : 'border-gray-100 dark:border-gray-800'
    }`}>
      <div className="p-5 md:p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center overflow-hidden shadow-sm ring-2 ring-blue-100 dark:ring-blue-900/30">
              {ins.photo_url ? (
                <StorageImg objectKey={ins.photo_url} alt={ins.full_name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-9 h-9 text-blue-400" />
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">{ins.full_name}</h3>

            {ins.position && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{ins.position}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-3">
              {ins.precinct_number && (
                <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold px-3 py-1 rounded-full text-xs">
                  <Hash className="w-3 h-3" /> Участок {ins.precinct_number}
                </span>
              )}
              {ins.district && (
                <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                  <MapPin className="w-3.5 h-3.5" /> {ins.district}
                </span>
              )}
            </div>

            {/* Address & Schedule */}
            {(ins.address || ins.schedule) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                {ins.address && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Building2 className="w-3 h-3 flex-shrink-0 text-gray-400" /> {ins.address}
                  </p>
                )}
                {ins.schedule && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 flex-shrink-0 text-gray-400" /> {ins.schedule}
                  </p>
                )}
              </div>
            )}

            {/* Streets */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Обслуживаемые улицы</p>
              <div className="flex flex-wrap gap-1.5">
                {displayStreets.map((street, i) => {
                  const isHighlighted = highlight && street.toLowerCase().includes(highlight.toLowerCase());
                  return (
                    <span
                      key={i}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                        isHighlighted
                          ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-800'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {street}
                    </span>
                  );
                })}
                {!expanded && moreCount > 0 && (
                  <button
                    onClick={() => setExpanded(true)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 transition-colors flex items-center gap-0.5"
                  >
                    и ещё {moreCount} <ChevronDown className="w-3 h-3" />
                  </button>
                )}
                {expanded && streetsList.length > 5 && (
                  <button
                    onClick={() => setExpanded(false)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 transition-colors flex items-center gap-0.5"
                  >
                    Свернуть <ChevronUp className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Description */}
            {ins.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 flex items-start gap-1.5">
                <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                {ins.description}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <a
            href={`tel:${ins.phone}`}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-xl transition-all duration-300 hover:shadow-md text-sm"
          >
            <Phone className="w-4 h-4" /> Позвонить
          </a>
          {ins.whatsapp && (
            <a
              href={`https://wa.me/${ins.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-3 rounded-xl transition-all duration-300 hover:shadow-md text-sm"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          )}
          {ins.lat && ins.lng && (
            <button
              onClick={onShowOnMap}
              className="inline-flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold px-4 py-3 rounded-xl transition-all duration-300 text-sm"
            >
              <MapPin className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}