import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { withRetry, formatDate } from '@/lib/api';
import { client } from '@/lib/api';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Search, Filter, Share2, Copy, Check, Loader2, Calendar, MapPin, ChevronDown, ChevronUp, X } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { resolveImageSrc } from '@/lib/storage';
import { toast } from 'sonner';

interface HistoryEvent {
  id: number;
  year: number;
  title: string;
  description: string;
  image_url?: string;
  image_url_after?: string;
  category: string;
  is_published: boolean;
  created_at?: string;
}

const CATEGORIES = [
  { id: 'all', label: 'Все', icon: '📋', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { id: 'Infrastructure', label: 'Инфраструктура', icon: '🏗️', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { id: 'Culture', label: 'Культура', icon: '🎭', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { id: 'People', label: 'Люди', icon: '👤', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { id: 'Transport', label: 'Транспорт', icon: '🚂', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Infrastructure: 'bg-blue-500',
  Culture: 'bg-purple-500',
  People: 'bg-amber-500',
  Transport: 'bg-emerald-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  Infrastructure: 'Инфраструктура',
  Culture: 'Культура',
  People: 'Люди',
  Transport: 'Транспорт',
};

function BeforeAfterSlider({ beforeKey, afterKey }: { beforeKey: string; afterKey: string }) {
  const [position, setPosition] = useState(50);

  const beforeUrl = resolveImageSrc(beforeKey);
  const afterUrl = resolveImageSrc(afterKey);

  if (!beforeUrl || !afterUrl) return null;

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden cursor-col-resize select-none group"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPosition(((e.clientX - rect.left) / rect.width) * 100);
      }}
      onTouchMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const touch = e.touches[0];
        setPosition(((touch.clientX - rect.left) / rect.width) * 100);
      }}
    >
      <img src={afterUrl} alt="После" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img src={beforeUrl} alt="До" className="absolute inset-0 w-full h-full object-cover" style={{ minWidth: '100%' }} loading="lazy" />
      </div>
      <div className="absolute top-0 bottom-0" style={{ left: `${position}%` }}>
        <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg -translate-x-1/2" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
          <span className="text-gray-600 text-xs font-bold">⇔</span>
        </div>
      </div>
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">До</div>
      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">После</div>
    </div>
  );
}

function ShareButtons({ event }: { event: HistoryEvent }) {
  const [copied, setCopied] = useState(false);

  const shareText = `📜 ${event.year} — ${event.title}\n\n${event.description.slice(0, 200)}...\n\nИстория Сортировки`;
  const shareUrl = `${window.location.origin}/history?event=${event.id}`;

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`, '_blank');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Ссылка скопирована');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  return (
    <div className="flex items-center gap-2 mt-3">
      <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={shareWhatsApp}>
        <Share2 className="h-3 w-3" /> WhatsApp
      </Button>
      <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={copyLink}>
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Скопировано' : 'Ссылка'}
      </Button>
    </div>
  );
}

function TimelineCard({ event, index }: { event: HistoryEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = event.description.length > 200;
  const dotColor = CATEGORY_COLORS[event.category] || 'bg-gray-500';
  const isLeft = index % 2 === 0;

  return (
    <div className={`relative flex items-start gap-4 md:gap-8 ${isLeft ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
      {/* Timeline dot */}
      <div className="absolute left-4 md:left-1/2 md:-translate-x-1/2 z-10">
        <div className={`w-4 h-4 rounded-full ${dotColor} ring-4 ring-white shadow-md`} />
      </div>

      {/* Year badge - desktop only */}
      <div className={`hidden md:flex w-[calc(50%-2rem)] ${isLeft ? 'justify-end' : 'justify-start'}`}>
        <div className="flex items-center gap-2 mt-1">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span className="text-2xl font-bold text-gray-300">{event.year}</span>
        </div>
      </div>

      {/* Card */}
      <div className={`ml-10 md:ml-0 md:w-[calc(50%-2rem)] w-[calc(100%-3rem)]`}>
        <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 border-gray-200">
          {/* Image section */}
          {event.image_url && event.image_url_after ? (
            <BeforeAfterSlider beforeKey={event.image_url} afterKey={event.image_url_after} />
          ) : event.image_url ? (
            <div className="aspect-video overflow-hidden">
              <StorageImg
                objectKey={event.image_url}
                alt={event.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}

          <CardContent className="p-4">
            {/* Mobile year */}
            <div className="md:hidden flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-gray-400">{event.year}</span>
            </div>

            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${
                event.category === 'Infrastructure' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                event.category === 'Culture' ? 'border-purple-300 text-purple-700 bg-purple-50' :
                event.category === 'People' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                'border-emerald-300 text-emerald-700 bg-emerald-50'
              }`}>
                {CATEGORY_LABELS[event.category] || event.category}
              </Badge>
            </div>

            <h3 className="font-semibold text-gray-900 text-base mb-2">{event.title}</h3>

            <p className="text-sm text-gray-600 leading-relaxed">
              {isLong && !expanded ? event.description.slice(0, 200) + '...' : event.description}
            </p>

            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-blue-600 text-xs mt-1 flex items-center gap-1 hover:underline"
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> Свернуть</> : <><ChevronDown className="h-3 w-3" /> Читать далее</>}
              </button>
            )}

            <ShareButtons event={event} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await withRetry(() =>
          client.entities.history_events.query({ sort: 'year', limit: 200 })
        );
        const items = (res.data?.items || []) as HistoryEvent[];
        setEvents(items.filter(e => e.is_published));
      } catch {
        toast.error('Ошибка загрузки истории');
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (activeCategory !== 'all') {
      result = result.filter(e => e.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        String(e.year).includes(q)
      );
    }
    return result;
  }, [events, activeCategory, searchQuery]);

  const yearRange = useMemo(() => {
    if (events.length === 0) return '';
    const years = events.map(e => e.year);
    return `${Math.min(...years)} — ${Math.max(...years)}`;
  }, [events]);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-800 text-white">
        <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
          <Link to="/" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" /> На главную
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">📜 История Сортировки</h1>
          <p className="text-white/70 text-sm md:text-base">
            Хроника событий района {yearRange && `• ${yearRange}`} • {events.length} событий
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="max-w-5xl mx-auto px-4 -mt-6 relative z-10">
        <Card className="shadow-lg border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Поиск по году, названию или описанию..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 md:hidden"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>

            {/* Category filters */}
            <div className={`flex flex-wrap gap-2 mt-3 ${showFilters ? '' : 'hidden md:flex'}`}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    activeCategory === cat.id
                      ? cat.id === 'all'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : cat.color.replace('bg-', 'bg-').replace('100', '600') + ' text-white border-transparent'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                  style={activeCategory === cat.id && cat.id !== 'all' ? {
                    backgroundColor: cat.id === 'Infrastructure' ? '#3B82F6' :
                      cat.id === 'Culture' ? '#8B5CF6' :
                      cat.id === 'People' ? '#F59E0B' : '#10B981',
                    color: 'white',
                    borderColor: 'transparent'
                  } : undefined}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  {activeCategory === cat.id && cat.id !== 'all' && (
                    <span className="ml-1 bg-white/30 rounded-full px-1.5 text-[10px]">
                      {events.filter(e => e.category === cat.id).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <p className="text-gray-500 text-sm">Загрузка истории...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500">
              {searchQuery || activeCategory !== 'all'
                ? 'Ничего не найдено. Попробуйте изменить фильтры.'
                : 'Пока нет событий в истории.'}
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[22px] md:left-1/2 md:-translate-x-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 via-purple-200 to-emerald-200" />

            <div className="space-y-8 md:space-y-12">
              {filteredEvents.map((event, index) => (
                <TimelineCard key={event.id} event={event} index={index} />
              ))}
            </div>

            {/* End dot */}
            <div className="absolute left-[22px] md:left-1/2 md:-translate-x-1/2 -bottom-2">
              <div className="w-3 h-3 rounded-full bg-gray-300 ring-4 ring-white" />
            </div>
          </div>
        )}
      </div>
      </div>
    </Layout>
  );
}