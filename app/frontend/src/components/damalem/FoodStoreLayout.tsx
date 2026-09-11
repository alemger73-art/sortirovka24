import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Utensils } from 'lucide-react';
import { resolveImageUrl } from '@/lib/storage';
import { DAM_ALEM_HERO_FALLBACK } from '@/lib/damAlem';

export function FoodStoreHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = ref.current;
    const page = header?.closest<HTMLElement>('.dam-page');
    if (!header || !page) return;
    const measure = () => page.style.setProperty('--dam-header-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return <header ref={ref} className="dam-market-header">{children}</header>;
}

export function FoodHeroPhoto({ source }: { source?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl('');
    resolveImageUrl(source || DAM_ALEM_HERO_FALLBACK)
      .then(value => { if (alive) setUrl(value || ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [source]);
  return <div className="dam-market-offer__photo" aria-hidden="true">
    <Utensils className="dam-market-offer__placeholder" />
    {url && <img src={url} alt="" fetchPriority="high" onError={() => setUrl('')} />}
  </div>;
}
