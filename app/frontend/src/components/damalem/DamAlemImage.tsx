import { useCallback, useEffect, useMemo, useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { buildImageFallbackChain } from '@/lib/damAlemImages';

interface Props {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fallbacks?: string[];
}

export default function DamAlemImage({ src, alt = '', className, loading = 'lazy', fallbacks }: Props) {
  const chain = useMemo(
    () => buildImageFallbackChain(src, fallbacks),
    [src, fallbacks],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [src]);

  const handleError = useCallback(() => {
    setIndex(prev => {
      if (prev >= chain.length) return prev;
      return prev + 1;
    });
  }, [chain.length]);

  const currentSrc = chain[Math.min(index, chain.length - 1)] ?? chain[0];

  if (index >= chain.length) {
    return <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={['dam-image-placeholder', className].filter(Boolean).join(' ')}><UtensilsCrossed aria-hidden="true" /></span>;
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      draggable={false}
      onError={handleError}
      style={{ pointerEvents: 'none' }}
    />
  );
}
