import { MessageCircle, Share2 } from 'lucide-react';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import { REFERRAL_SHARE_MESSAGE } from '@/lib/damAlemMarketing';

interface Props {
  whatsappNumber?: string;
  brandName?: string;
}

export default function DamAlemShareCard({ whatsappNumber, brandName = DAM_ALEM_BRAND }: Props) {
  const digits = (whatsappNumber || '').replace(/\D/g, '');
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/food` : '';
  const shareText = `${REFERRAL_SHARE_MESSAGE}\n${pageUrl}`;

  const share = () => {
    if (navigator.share) {
      void navigator.share({
        title: brandName,
        text: REFERRAL_SHARE_MESSAGE,
        url: pageUrl,
      }).catch(() => {});
      return;
    }
    const encoded = encodeURIComponent(shareText);
    if (digits) {
      window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener');
    }
  };

  return (
    <button type="button" onClick={share} className="dam-share-card w-full text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
        <Share2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900">Приведи друга — подари скидку</p>
        <p className="text-xs text-zinc-500">DAMALEM10 — друг получит −10% на заказ</p>
      </div>
      <MessageCircle className="h-5 w-5 shrink-0 text-emerald-500" />
    </button>
  );
}
