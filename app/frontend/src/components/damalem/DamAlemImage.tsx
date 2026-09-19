import { useCallback, useEffect, useMemo, useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { buildImageFallbackChain } from '@/lib/damAlemImages';
import { resolveImageSrc, resolveImageUrl } from '@/lib/storage';

interface Props {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fallbacks?: string[];
}

export default function DamAlemImage({ src, alt = '', className, loading = 'lazy', fallbacks }: Props) {
  const synchronousSource = resolveImageSrc(src) || '';
  const [resolvedSource, setResolvedSource] = useState(synchronousSource);

  useEffect(() => {
    let active = true;
    setResolvedSource(synchronousSource);
    if (!src || synchronousSource) return () => { active = false; };

    void resolveImageUrl(src).then((url) => {
      if (active && url) setResolvedSource(url);
    });
    return () => { active = false; };
  }, [src, synchronousSource]);

  const chain = useMemo(
    () => buildImageFallbackChain(resolvedSource, fallbacks),
    [resolvedSource, fallbacks],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [resolvedSource]);

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
