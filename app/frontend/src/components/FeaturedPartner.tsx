/** The project's main partner (admin: «Главный партнёр»), shown on the prominent spots of the site.
 *  `banner` — one slim row: logo, name, offer and a call button (home); `compact` — one row with logo and offer (directory, «Ещё»). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Phone } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { phoneLink } from '@/lib/directoryContent';
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
  const phone = phoneLink(partner.phone);
  const label = kz ? 'Жарнама · Жобаның басты серіктесі' : 'Реклама · Главный партнёр проекта';
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

  return <div className={className}><section aria-label={label} className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-3 py-2 dark:border-blue-900 dark:bg-gray-900">
    <Link to={page} onClick={() => click('card')} className="flex min-w-0 flex-1 items-center gap-3">
      {partner.logo && <StorageImg objectKey={partner.logo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />}
      <span className="min-w-0">
        <b className="block truncate text-[15px] leading-tight">{partner.name} <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">· {kz ? 'басты серіктес · жарнама' : 'главный партнёр · реклама'}</span></b>
        {partner.offer && <span className="block truncate text-[13px] text-gray-600 dark:text-gray-300">{partner.offer}</span>}
      </span>
    </Link>
    {phone && <a href={phone} onClick={() => click('call')} aria-label={kz ? `${partner.name}: қоңырау` : `Позвонить в ${partner.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Phone className="h-4 w-4" /></a>}
  </section></div>;
}
