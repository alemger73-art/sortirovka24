import { useEffect, useState } from 'react';
import { resolveImageUrl } from '@/lib/storage';

/** A real dish photo from the menu for the top banner. Nothing is shown until the photo loads (no stock images). */
export default function DamAlemHeroDish({ source }: { source?: string }) {
  const [url, setUrl] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(''); setReady(false);
    if (source) resolveImageUrl(source).then((value) => { if (alive) setUrl(value || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [source]);
  if (!url) return null;
  return (
    <span className={`dam-hero-dish${ready ? ' is-ready' : ''}`} aria-hidden="true">
      <img src={url} alt="" decoding="async" onLoad={() => setReady(true)} onError={() => setUrl('')} />
    </span>
  );
}
