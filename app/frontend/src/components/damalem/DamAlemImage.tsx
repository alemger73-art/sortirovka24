import { useCallback, useEffect, useMemo, useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { buildImageFallbackChain } from '@/lib/damAlemImages';
import { optimizeImageUrl, resolveImageSrc, resolveImageUrl } from '@/lib/storage';

interface Props {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fallbacks?: string[];
  /** Largest width the photo is shown at; menu cards need far less than the 1200px default. */
  width?: number;
}

export default function DamAlemImage({ src, alt = '', className, loading = 'lazy', fallbacks, width }: Props) {
  const sized = (url: string) => (width ? optimizeImageUrl(url.replace(/\/f_auto,q_auto,c_limit,w_\d+\//, '/'), width) : url);
  const synchronousSource = sized(resolveImageSrc(src) || '');
  const [resolvedSource, setResolvedSource] = useState(synchronousSource);

  useEffect(() => {
    let active = true;
    setResolvedSource(synchronousSource);
    if (!src || synchronousSource) return () => { active = false; };

    void resolveImageUrl(src).then((url) => {
      if (active && url) setResolvedSource(sized(url));
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
