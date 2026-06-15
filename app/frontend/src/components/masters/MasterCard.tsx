import { Link } from 'react-router-dom';
import { Phone, MessageCircle, MapPin, CheckCircle, ChevronRight } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import StarRating from './StarRating';
import { categoryGradient, categoryIcon, parseServices } from './mastersTheme';

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
  const services = parseServices(master.services, 2);
  const rating = Number(master.rating) || 0;

  return (
    <TooltipProvider delayDuration={200}>
      <article className="group flex flex-col rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-200 overflow-hidden">
        <div className="p-4 flex gap-3">
          {/* Avatar */}
          <Link to={`/masters/${master.id}`} className="flex-shrink-0">
            <div className={`relative w-16 h-16 rounded-xl overflow-hidden ring-2 ring-white dark:ring-gray-800 shadow-sm bg-gradient-to-br ${gradient}`}>
              {master.photo_url ? (
                <StorageImg objectKey={master.photo_url} alt={master.name} className="w-full h-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-2xl">{categoryIcon(master.category)}</span>
              )}
              {master.available_today && (
                <span className="absolute bottom-0 inset-x-0 bg-green-500 text-white text-[9px] font-bold text-center py-0.5">
                  {t('masters.available')}
                </span>
              )}
            </div>
          </Link>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/masters/${master.id}`} className="flex items-center gap-1.5 min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{master.name}</h3>
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
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">{master.category}</p>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <div className="flex items-center gap-1">
                  <StarRating rating={rating} size="sm" />
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{rating > 0 ? rating.toFixed(1) : '—'}</span>
                </div>
                <span className="text-[10px] text-gray-400">({master.reviews_count ?? 0})</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              {master.district && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" /> {master.district}
                </span>
              )}
              {master.experience_years ? (
                <span>{t('masters.experience').replace('{years}', String(master.experience_years))}</span>
              ) : null}
            </div>

            {master.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-2 leading-relaxed">{master.description}</p>
            )}

            {services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {services.map((s) => (
                  <span key={s} className="text-[10px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/80 dark:bg-gray-950/50 border-t border-gray-100 dark:border-gray-800">
          {master.phone ? (
            <a
              href={`tel:${master.phone}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl transition-colors"
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
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-2 rounded-xl transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t('masters.write')}
            </a>
          ) : null}
          <Link
            to={`/masters/${master.id}`}
            className="inline-flex items-center justify-center gap-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-2"
          >
            {t('masters.details')}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </article>
    </TooltipProvider>
  );
}
