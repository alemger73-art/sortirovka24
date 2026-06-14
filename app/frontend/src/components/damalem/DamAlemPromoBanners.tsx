import { Link } from 'react-router-dom';
import StorageImg from '@/components/StorageImg';
import { ChevronRight, Sparkles } from 'lucide-react';

export interface FoodBanner {
  id: number;
  title: string;
  subtitle?: string;
  image_url?: string;
  button_text?: string;
  button_url?: string;
}

interface DamAlemPromoBannersProps {
  banners: FoodBanner[];
}

export default function DamAlemPromoBanners({ banners }: DamAlemPromoBannersProps) {
  if (banners.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-[#111111]">
          <Sparkles className="h-5 w-5 text-[#FF3B30]" />
          Акции DAM ALEM
        </h2>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {banners.map(b => {
          const inner = (
            <article className="group relative h-36 w-[280px] shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 transition hover:shadow-xl sm:w-[300px]">
              {b.image_url ? (
                <StorageImg objectKey={b.image_url} alt={b.title} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30] to-[#c41e14]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <div className="relative z-10 flex h-full flex-col justify-end p-4">
                {b.button_text && (
                  <span className="mb-2 inline-flex w-fit rounded-full bg-[#FF3B30] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {b.button_text}
                  </span>
                )}
                <h3 className="line-clamp-2 text-base font-extrabold leading-snug text-white">{b.title}</h3>
                {b.subtitle && <p className="mt-1 line-clamp-2 text-xs text-white/75">{b.subtitle}</p>}
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white/90">
                  Подробнее <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </article>
          );

          const url = b.button_url || '/food';
          if (url.startsWith('/')) {
            return <Link key={b.id} to={url}>{inner}</Link>;
          }
          return (
            <a key={b.id} href={url} target="_blank" rel="noopener noreferrer">
              {inner}
            </a>
          );
        })}
      </div>
    </section>
  );
}
