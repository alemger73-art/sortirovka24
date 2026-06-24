import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildVolnaImageChain } from '@/lib/volnaImages';

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  kind?: 'hero' | 'promo' | 'category' | 'product';
}

export default function VolnaImage({ src, alt = '', className, loading = 'lazy', kind = 'product' }: Props) {
  const chain = useMemo(() => buildVolnaImageChain(src, kind), [src, kind]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [src, kind]);

  const handleError = useCallback(() => {
    setIndex((prev) => (prev + 1 >= chain.length ? prev : prev + 1));
  }, [chain.length]);

  const currentSrc = chain[Math.min(index, chain.length - 1)] ?? chain[0];

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      draggable={false}
      onError={handleError}
    />
  );
}
