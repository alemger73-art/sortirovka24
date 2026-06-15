import { Star } from 'lucide-react';

export default function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const stars = [];
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(<Star key={i} className={`${cls} text-amber-400 fill-amber-400`} />);
    } else if (i === full && hasHalf) {
      stars.push(
        <div key={i} className="relative">
          <Star className={`${cls} text-gray-200 dark:text-gray-700`} />
          <div className="absolute inset-0 overflow-hidden w-1/2">
            <Star className={`${cls} text-amber-400 fill-amber-400`} />
          </div>
        </div>
      );
    } else {
      stars.push(<Star key={i} className={`${cls} text-gray-200 dark:text-gray-700`} />);
    }
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}
