/** The project's main partner (admin: «Главный партнёр»), shown on the prominent spots of the site.
 *  `banner` — a large card with the cover photo (home); `compact` — one row with logo and offer (directory, «Ещё»). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MessageCircle, Phone } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { phoneLink, whatsappLink } from '@/lib/directoryContent';
import { track } from '@/lib/analytics';

let loading: Promise<PartnerProfile | null> | null = null;
function loadFeatured(): Promise<PartnerProfile | null> {
  loading ??= partnerProfiles.list()
    .then(r => r.items.find(p => p.published && p.featured) || null)
    .catch(() => { loading = null; return null; });
  return loading;
}

type Props = { variant?: 'banner' | 'compact'; place: string; className?: string };

export default function FeaturedPartner({ variant = 'banner', place, className }: Props) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const { isEnabled } = useModules();
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  useEffect(() => {
    let live = true;
    loadFeatured().then(p => { if (live) setPartner(p); });
    return () => { live = false; };
  }, []);
  if (!partner || !isEnabled('business')) return null;

  const page = `/partners/${partner.slug}`;
  const phone = phoneLink(partner.phone), wa = whatsappLink(partner.whatsapp);
  const label = kz ? 'Жобаның басты серіктесі' : 'Главный партнёр проекта';
  const click = (what: string) => track('promo_click', { promo: 'featured_partner', place, what });

  if (variant === 'compact') {
    return <div className={className}><Link to={page} onClick={() => click('card')} className="flex items-center gap-3 rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
      {partner.logo && <StorageImg objectKey={partner.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />}
      <span className="min-w-0 flex-1">
        <small className="block text-xs font-semibold text-blue-700 dark:text-blue-300">{label}</small>
        <b className="block truncate text-base">{partner.name} — {partner.category.toLowerCase()}</b>
        {partner.offer && <span className="block truncate text-sm text-gray-600 dark:text-gray-300">{partner.offer}</span>}
      </span>
      <ArrowUpRight className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" aria-hidden="true" />
    </Link></div>;
  }

  return <div className={className}><section aria-label={label} className="overflow-hidden rounded-[22px] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 sm:grid sm:grid-cols-[1fr_1.1fr]">
    <Link to={page} onClick={() => click('photo')} className="relative block aspect-[16/9] bg-gray-100 dark:bg-gray-800 sm:aspect-auto">
      {partner.cover && <StorageImg objectKey={partner.cover} alt={partner.name} className="h-full w-full object-cover" />}
      <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">{label}</span>
    </Link>
    <div className="flex flex-col gap-2 p-4 sm:p-6">
      <div className="flex items-center gap-2.5">
        {partner.logo && <StorageImg objectKey={partner.logo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0"><h2 className="truncate text-xl font-extrabold leading-tight"><Link to={page} onClick={() => click('name')}>{partner.name}</Link></h2><p className="text-sm text-gray-500">{partner.category}</p></div>
      </div>
      <p className="text-[15px] leading-snug text-gray-700 dark:text-gray-200">{partner.headline}</p>
      {partner.offer && <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">{partner.offer}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {phone && <a href={phone} onClick={() => click('call')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"><Phone className="h-4 w-4" />{kz ? 'Қоңырау' : 'Позвонить'}</a>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => click('whatsapp')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold dark:border-gray-700"><MessageCircle className="h-4 w-4" />WhatsApp</a>}
        <Link to={page} onClick={() => click('more')} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-blue-700 dark:text-blue-300">{kz ? 'Жұмыстар мен қызметтер' : 'Работы и услуги'}<ArrowUpRight className="h-4 w-4" /></Link>
      </div>
    </div>
  </section></div>;
}
