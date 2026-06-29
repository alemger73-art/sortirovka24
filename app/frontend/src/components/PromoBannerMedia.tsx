import { memo, useCallback, useMemo, useState } from 'react';
import { buildSiteBannerImageChain } from '@/lib/siteBannerImages';

interface PromoBannerMediaProps {
  imageUrl?: string | null;
  title?: string;
  alt?: string;
  className?: string;
  priority?: boolean;
}

const PromoBannerMedia = memo(function PromoBannerMedia({
  imageUrl,
  title,
  alt = '',
  className = 'absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105',
  priority = false,
}: PromoBannerMediaProps) {
  const chain = useMemo(() => buildSiteBannerImageChain(title, imageUrl), [title, imageUrl]);
  const [index, setIndex] = useState(0);
  const src = chain[Math.min(index, chain.length - 1)];

  const handleError = useCallback(() => {
    setIndex((current) => (current < chain.length - 1 ? current + 1 : current));
  }, [chain.length]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={handleError}
    />
  );
});

export default PromoBannerMedia;
