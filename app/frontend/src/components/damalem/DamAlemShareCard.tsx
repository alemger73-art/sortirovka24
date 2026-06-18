import { MessageCircle, Share2 } from 'lucide-react';

interface Props {
  whatsappNumber?: string;
  brandName?: string;
}

export default function DamAlemShareCard({ whatsappNumber, brandName = 'DAM ALEM' }: Props) {
  const digits = (whatsappNumber || '').replace(/\D/g, '');
  const shareText = encodeURIComponent(
    `Заказываю в ${brandName} — вкусная доставка по Сортировке 🍕\n${typeof window !== 'undefined' ? window.location.origin : ''}/food`,
  );

  const share = () => {
    if (navigator.share) {
      void navigator.share({
        title: brandName,
        text: `Заказываю в ${brandName} — доставка еды в Сортировке`,
        url: `${window.location.origin}/food`,
      }).catch(() => {});
      return;
    }
    if (digits) {
      window.open(`https://wa.me/?text=${shareText}`, '_blank', 'noopener');
    }
  };

  return (
    <button type="button" onClick={share} className="dam-share-card w-full text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
        <Share2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900">Расскажи друзьям</p>
        <p className="text-xs text-zinc-500">Поделись ссылкой на {brandName}</p>
      </div>
      <MessageCircle className="h-5 w-5 shrink-0 text-emerald-500" />
    </button>
  );
}
