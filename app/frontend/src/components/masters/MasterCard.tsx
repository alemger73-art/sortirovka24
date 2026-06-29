import { Link } from 'react-router-dom';
import { Phone, MessageCircle, MapPin, CheckCircle, ChevronRight, Star, Award } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { categoryGradient, categoryIcon, categoryBg, parseServices } from './mastersTheme';

export interface MasterCardData {
  id: number | string;
  name: string;
  category: string;
  phone?: string;
  whatsapp?: string;
  district?: string;
  description?: string;
  rating?: number;
  reviews_count?: number;
  photo_url?: string;
  gallery_images?: string;
  verified?: boolean;
  available_today?: boolean;
  services?: string;
  experience_years?: number;
}

export default function MasterCard({ master }: { master: MasterCardData }) {
  const { t } = useLanguage();
  const gradient = categoryGradient(master.category);
  const bgTint = categoryBg(master.category);
  const services = parseServices(master.services, 3);
  const rating = Number(master.rating) || 0;
  const isTop = rating >= 4.5 && (master.reviews_count ?? 0) >= 1;

  return (
    <TooltipProvider delayDuration={200}>
      <article className={`group relative flex flex-col rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-indigo-200/80 dark:hover:border-indigo-800/80 transition-all duration-300 overflow-hidden`}>
        <div className={`h-1.5 w-full bg-gradient-to-r ${gradient}`} />

        <div className="p-4 flex gap-3.5">
          <Link to={`/masters/${master.id}`} className="flex-shrink-0">
            <div className={`relative w-[4.5rem] h-[4.5rem] rounded-2xl overflow-hidden ring-2 ring-white dark:ring-gray-900 shadow-md bg-gradient-to-br ${gradient}`}>
              {master.photo_url ? (
                <StorageImg objectKey={master.photo_url} alt={master.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-3xl">{categoryIcon(master.category)}</span>
              )}
              {master.available_today && (
                <span className="absolute bottom-0 inset-x-0 bg-emerald-500 text-white text-[9px] font-bold text-center py-0.5 tracking-wide">
                  {t('masters.available')}
                </span>
              )}
            </div>
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/masters/${master.id}`} className="flex items-center gap-1.5 min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white text-[15px] truncate leading-tight">{master.name}</h3>
                  {master.verified && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px] text-xs">
                        {t('masters.verifiedHint')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </Link>
                <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${bgTint} text-gray-700 dark:text-gray-200`}>
                  {categoryIcon(master.category)} {master.category}
                </span>
              </div>
              <div className="flex flex-col items-end flex-shrink-0 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-2 py-1">
                <div className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                  <span className="text-sm font-black text-gray-900 dark:text-white">{rating > 0 ? rating.toFixed(1) : '—'}</span>
                </div>
                <span className="text-[10px] text-gray-400">{master.reviews_count ?? 0} {t('masters.reviews')}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              {master.district && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="w-3 h-3 text-indigo-400" /> {master.district}
                </span>
              )}
              {master.experience_years ? (
                <span>{t('masters.experience').replace('{years}', String(master.experience_years))}</span>
              ) : null}
              {isTop && (
                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                  <Award className="w-3 h-3" /> {t('masters.topMaster')}
                </span>
              )}
            </div>

            {master.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-2 leading-relaxed">{master.description}</p>
            )}

            {services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2.5">
                {services.map((s) => (
                  <span key={s} className="text-[10px] font-medium text-indigo-700/80 dark:text-indigo-300/90 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md border border-indigo-100/80 dark:border-indigo-900/50">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-50/90 to-white dark:from-gray-950/60 dark:to-gray-900 border-t border-gray-100 dark:border-gray-800">
          {master.phone ? (
            <a
              href={`tel:${master.phone}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-3 py-2.5 rounded-xl shadow-sm transition-all"
            >
              <Phone className="w-3.5 h-3.5" />
              {t('masters.call')}
            </a>
          ) : null}
          {master.whatsapp ? (
            <a
              href={`https://wa.me/${master.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 px-3 py-2.5 rounded-xl shadow-sm transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t('masters.write')}
            </a>
          ) : null}
          <Link
            to={`/masters/${master.id}`}
            className="inline-flex items-center justify-center gap-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-2.5 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
          >
            {t('masters.details')}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </article>
    </TooltipProvider>
  );
}
