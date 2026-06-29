import { Link } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { categoryGradient, categoryIcon } from './mastersTheme';
import type { MasterCardData } from './MasterCard';

export default function FeaturedMastersStrip({ masters }: { masters: MasterCardData[] }) {
  const { t } = useLanguage();
  if (masters.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('masters.featuredTitle')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('masters.featuredSubtitle')}</p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {masters.map((master) => {
          const gradient = categoryGradient(master.category);
          const rating = Number(master.rating) || 0;
          return (
            <Link
              key={master.id}
              to={`/masters/${master.id}`}
              className="group flex-shrink-0 w-[11.5rem] rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className={`h-1 w-full bg-gradient-to-r ${gradient}`} />
              <div className="p-3">
                <div className={`w-14 h-14 rounded-xl overflow-hidden mx-auto mb-2 ring-2 ring-white dark:ring-gray-900 shadow bg-gradient-to-br ${gradient}`}>
                  {master.photo_url ? (
                    <StorageImg objectKey={master.photo_url} alt={master.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-2xl">{categoryIcon(master.category)}</span>
                  )}
                </div>
                <p className="font-bold text-sm text-gray-900 dark:text-white truncate text-center">{master.name}</p>
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold text-center truncate mt-0.5">{master.category}</p>
                <div className="flex items-center justify-center gap-1 mt-1.5">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                  <span className="text-xs font-bold">{rating > 0 ? rating.toFixed(1) : '—'}</span>
                  {master.available_today && (
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full ml-1">
                      {t('masters.available')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold text-center mt-2 flex items-center justify-center gap-0.5 group-hover:gap-1 transition-all">
                  {t('masters.details')} <ChevronRight className="w-3 h-3" />
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
