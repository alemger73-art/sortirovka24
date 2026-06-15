import { Link } from 'react-router-dom';
import { Phone, MessageCircle, MapPin, CheckCircle, Clock, Award, Shield, Images, ChevronRight } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { resolveImageSrc, isDirectUrl } from '@/lib/storage';
import { useLanguage } from '@/contexts/LanguageContext';
import StarRating from './StarRating';
import { categoryGradient, categoryIcon, parseServices, galleryCount } from './mastersTheme';

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
  const services = parseServices(master.services, 3);
  const photos = galleryCount(master.gallery_images);
  const galleryKeys = (master.gallery_images || '').split(',').map(k => k.trim()).filter(Boolean).slice(0, 3);

  return (
    <article className="group flex flex-col bg-white dark:bg-gray-900 rounded-3xl shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 border border-gray-100/80 dark:border-gray-800 overflow-hidden">
      {/* Cover */}
      <Link to={`/masters/${master.id}`} className="relative block h-36 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        {master.photo_url ? (
          <StorageImg objectKey={master.photo_url} alt={master.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl opacity-90 drop-shadow-lg">{categoryIcon(master.category)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-white text-lg truncate drop-shadow-md">{master.name}</h3>
              {master.verified && (
                <CheckCircle className="w-5 h-5 text-blue-300 flex-shrink-0 drop-shadow" aria-label={t('masters.verified')} />
              )}
            </div>
            <p className="text-white/85 text-sm font-semibold truncate">{master.category}</p>
          </div>
          {master.available_today && (
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-green-500/90 backdrop-blur text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {t('masters.available')}
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-col flex-1 p-5">
        {/* Rating */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <StarRating rating={Number(master.rating) || 0} size="sm" />
            <span className="text-base font-black text-gray-900 dark:text-white">{master.rating ?? '—'}</span>
            <span className="text-xs text-gray-400">({master.reviews_count ?? 0})</span>
          </div>
          {photos > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
              <Images className="w-3.5 h-3.5" /> {photos}
            </span>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Number(master.rating) >= 4.5 && (
            <Badge icon={Award} tone="amber">{t('masters.topMaster')}</Badge>
          )}
          {master.verified && (
            <Badge icon={Shield} tone="blue">{t('masters.verified')}</Badge>
          )}
          {master.district && (
            <Badge icon={MapPin} tone="emerald">{master.district}</Badge>
          )}
          {master.experience_years ? (
            <Badge icon={Clock} tone="purple">
              {t('masters.experience').replace('{years}', String(master.experience_years))}
            </Badge>
          ) : null}
        </div>

        {/* Description */}
        {master.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed mb-3">{master.description}</p>
        )}

        {/* Service tags */}
        {services.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {services.map(s => (
              <span key={s} className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Gallery preview */}
        {galleryKeys.length > 0 && (
          <div className="flex gap-1.5 mb-4">
            {galleryKeys.map(key => (
              <div key={key} className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700">
                <img
                  src={isDirectUrl(key) ? key : resolveImageSrc(key)}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
            {photos > 3 && (
              <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500">
                +{photos - 3}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
          <Link
            to={`/masters/${master.id}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-3 py-2.5 rounded-2xl transition-all"
          >
            {t('masters.details')}
            <ChevronRight className="w-4 h-4" />
          </Link>
          {master.whatsapp && (
            <a
              href={`https://wa.me/${master.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-11 h-11 bg-green-500 hover:bg-green-600 text-white rounded-2xl shadow-md hover:scale-105 transition-all"
              title={t('masters.write')}
            >
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
          {master.phone && (
            <a
              href={`tel:${master.phone}`}
              className="inline-flex items-center justify-center w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-md hover:scale-105 transition-all"
              title={t('masters.call')}
            >
              <Phone className="w-5 h-5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function Badge({ icon: Icon, tone, children }: { icon: typeof Award; tone: string; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    amber: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30',
    blue: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30',
    emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30',
    purple: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${tones[tone] || tones.blue}`}>
      <Icon className="w-3 h-3" /> {children}
    </span>
  );
}
