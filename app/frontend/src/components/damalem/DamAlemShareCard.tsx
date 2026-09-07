import { MessageCircle, Share2 } from 'lucide-react';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import { REFERRAL_SHARE_MESSAGE } from '@/lib/damAlemMarketing';

interface Props {
  whatsappNumber?: string;
  brandName?: string;
  title?: string;
  subtitle?: string;
  shareText?: string;
}

export default function DamAlemShareCard({
  whatsappNumber,
  brandName = DAM_ALEM_BRAND,
  title = 'Отправить другу — скидка 10%',
  subtitle = 'Друг получает код DAMALEM10 на заказ',
  shareText,
}: Props) {
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/food?promo=DAMALEM10` : '';
  const body = (shareText || REFERRAL_SHARE_MESSAGE).trim();
  const sharePayload = `${body}\n${pageUrl}`;

  const share = () => {
    if (navigator.share) {
      void navigator.share({
        title: brandName,
        text: body,
        url: pageUrl,
      }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(sharePayload)}`, '_blank', 'noopener');
      });
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(sharePayload)}`, '_blank', 'noopener');
  };

  return (
    <button type="button" onClick={share} className="dam-share-card">
      <span className="dam-share-card__icon">
        <Share2 className="h-5 w-5" />
      </span>
      <span className="dam-share-card__text">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <MessageCircle className="h-5 w-5 shrink-0 text-emerald-600" />
    </button>
  );
}
