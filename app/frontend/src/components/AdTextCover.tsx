import { Briefcase, Gift, KeyRound, Megaphone, Search, ShoppingCart, Tag, UserRound, Wrench, type LucideIcon } from 'lucide-react';
import '@/styles/adTextCover.css';

const KIND_ICONS: Record<string, LucideIcon> = {
  sell: Tag, buy: ShoppingCart, job: Briefcase, seek: UserRound, services: Wrench, rent: KeyRound, free: Gift, lost: Search,
};

/** Cover for an ad without a photo: its own title on a calm colour of its kind, instead of an empty box with an icon. */
export default function AdTextCover({ title, kind, size = 'card' }: { title?: string | null; kind?: string | null; size?: 'card' | 'big' | 'mini' }) {
  const Icon = KIND_ICONS[String(kind || '')] || Megaphone;
  return (
    <div className={`ad-text-cover ad-text-cover--${size}`} data-kind={kind || undefined} aria-hidden>
      <span className="ad-text-cover__title">{title}</span>
      <Icon className="ad-text-cover__mark" strokeWidth={1.5} />
    </div>
  );
}
