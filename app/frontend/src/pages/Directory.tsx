import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry, DIRECTORY_CATEGORIES, DIRECTORY_CATEGORY_ICONS, EMERGENCY_NUMBERS, getDirectoryCategoryLabel, sortDirectoryEntries } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Search, Phone, MapPin, BookOpen, BadgeCheck, Bus, ChevronLeft,
  Copy, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface DirectoryEntry {
  id: number;
  entry_name: string;
  category: string;
  address?: string;
  phone: string;
  description?: string;
  sort_order?: number | null;
}

const QUICK_SECTIONS = [
  {
    to: '/inspectors',
    icon: BadgeCheck,
    titleKey: 'directory.inspectorsTitle',
    descKey: 'directory.inspectorsDesc',
    gradient: 'from-blue-600 to-indigo-700',
  },
  {
    to: '/transport',
    icon: Bus,
    titleKey: 'directory.transportTitle',
    descKey: 'directory.transportDesc',
    gradient: 'from-emerald-600 to-teal-700',
  },
] as const;

async function copyPhone(phone: string, t: (key: string) => string) {
  try {
    await navigator.clipboard.writeText(phone);
    toast.success(t('common.copied'));
  } catch {
    toast.error(t('common.error'));
  }
}

export default function DirectoryPage() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetchWithCache(
        'directory_entries_v2',
        () => withRetry(() => client.entities.directory_entries.query({ sort: 'sort_order', limit: 200 })),
        10 * 60 * 1000
      );
      setEntries(sortDirectoryEntries(res.data?.items || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const normalizeQuery = searchQuery.trim().toLowerCase();

  const filtered = useMemo(() => {
    let list = entries;
    if (category) list = list.filter(e => e.category === category);
    if (normalizeQuery) {
      list = list.filter(e => {
        const hay = `${e.entry_name} ${e.phone} ${e.description || ''} ${e.address || ''} ${e.category}`.toLowerCase();
        const words = normalizeQuery.split(/\s+/).filter(w => w.length > 1);
        return words.some(w => hay.includes(w)) || hay.includes(normalizeQuery);
      });
    }
    return sortDirectoryEntries(list);
  }, [entries, category, normalizeQuery]);

  const grouped = useMemo(() => {
    const acc: Record<string, DirectoryEntry[]> = {};
    for (const e of filtered) {
      const cat = e.category || 'Прочее';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(e);
    }
    const order = [...DIRECTORY_CATEGORIES, 'Прочее'];
    return order
      .filter(cat => acc[cat]?.length)
      .map(cat => [cat, acc[cat]] as [string, DirectoryEntry[]]);
  }, [filtered]);

  const hasSearch = normalizeQuery.length > 0;

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-emerald-700 to-green-800">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-teal-400/15 rounded-full blur-[100px]" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-emerald-300/10 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 pt-10 pb-12 md:pt-14 md:pb-16">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl rounded-full px-4 py-1.5 border border-white/15 mb-5">
            <BookOpen className="w-4 h-4 text-teal-200" />
            <span className="text-white/80 text-sm font-medium">{t('nav.directory')}</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-white mb-3 leading-tight">
            {t('directory.title')}
          </h1>
          <p className="text-base md:text-lg text-white/50 mb-8 max-w-lg leading-relaxed">
            {t('directory.subtitle')}
          </p>

          <div className="max-w-xl">
            <div className="flex items-center bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/15 overflow-hidden ring-1 ring-white/20">
              <Search className="w-5 h-5 text-teal-600 ml-5 flex-shrink-0" />
              <input
                type="text"
                placeholder={t('directory.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-4 text-gray-800 placeholder:text-gray-400 bg-transparent outline-none text-base font-medium"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-teal-200" />
              <span className="text-white/70 text-xs">{entries.length} {t('directory.entriesCount')}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-white/70 text-xs">{t('inspectors.district')}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-gray-50 dark:bg-gray-950 min-h-[50vh]">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Emergency bar */}
          <div className="mb-6 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 rounded-2xl p-4 border border-red-100 dark:border-red-900/30">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-0.5">{t('directory.emergencyTitle')}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('directory.emergencyHint')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {EMERGENCY_NUMBERS.map(em => (
                <a
                  key={em.number}
                  href={`tel:${em.number}`}
                  className="flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-xl p-3 border border-red-100 dark:border-red-900/30 hover:shadow-md hover:border-red-200 transition-all group"
                >
                  <span className="text-xl font-black text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform">{em.number}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center mt-0.5 leading-tight">{t(em.labelKey)}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Quick sections */}
          <section className="mb-8">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              {t('directory.quickSections')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_SECTIONS.map(section => (
                <Link
                  key={section.to}
                  to={section.to}
                  className={`group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-r ${section.gradient} hover:shadow-lg transition-all hover:-translate-y-0.5`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-white/25 transition-colors">
                      <section.icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold text-base">{t(section.titleKey)}</h3>
                      <p className="text-white/60 text-sm truncate">{t(section.descKey)}</p>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-white/40 rotate-180 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setCategory('')}
              className={`px-3.5 py-2 rounded-full text-sm font-medium transition-colors ${
                !category
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {t('common.all')}
            </button>
            {DIRECTORY_CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCategory(category === c ? '' : c)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  category === c
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span>{DIRECTORY_CATEGORY_ICONS[c]}</span>
                {getDirectoryCategoryLabel(c, t)}
              </button>
            ))}
          </div>

          {/* Results header */}
          {hasSearch && !loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {filtered.length > 0
                ? <>{t('directory.found')} <span className="font-bold text-gray-900 dark:text-white">{filtered.length}</span></>
                : t('directory.emptySearch')
              }
            </p>
          )}

          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
              <p className="text-gray-400 mt-4 text-sm">{t('common.loading')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {hasSearch || category ? t('directory.emptySearch') : t('directory.emptyCategory')}
              </h3>
              {(hasSearch || category) && (
                <button
                  onClick={() => { setSearchQuery(''); setCategory(''); }}
                  className="text-teal-600 hover:text-teal-700 dark:text-teal-400 font-semibold text-sm mt-2"
                >
                  {t('common.showAll')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([cat, items]) => (
                <div key={cat}>
                  <h2 className="text-lg font-extrabold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <span className="text-xl">{DIRECTORY_CATEGORY_ICONS[cat] || '📋'}</span>
                    {getDirectoryCategoryLabel(cat, t)}
                    <span className="text-sm font-medium text-gray-400">({items.length})</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map(d => (
                      <DirectoryCard key={d.id} entry={d} onCopy={copyPhone} t={t} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function DirectoryCard({
  entry,
  onCopy,
  t,
}: {
  entry: DirectoryEntry;
  onCopy: (phone: string, t: (key: string) => string) => void;
  t: (key: string) => string;
}) {
  const isEmergency = entry.category === 'Экстренные службы';

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border overflow-hidden ${
      isEmergency ? 'border-red-100 dark:border-red-900/30' : 'border-gray-100 dark:border-gray-800'
    }`}>
      <div className="p-4 md:p-5">
        <h3 className="font-bold text-gray-900 dark:text-white text-base mb-1">{entry.entry_name}</h3>
        {entry.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">{entry.description}</p>
        )}
        {entry.address && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{entry.address}</span>
          </div>
        )}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          <a
            href={`tel:${entry.phone}`}
            className={`flex-1 inline-flex items-center justify-center gap-2 font-bold px-3 py-2.5 rounded-xl transition-all text-sm ${
              isEmergency
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            <Phone className="w-4 h-4" />
            {entry.phone}
          </a>
          <button
            onClick={() => onCopy(entry.phone, t)}
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
            title={t('common.copy')}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
