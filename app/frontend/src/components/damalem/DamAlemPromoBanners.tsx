import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { resolveImageUrl } from '@/lib/storage';
import { foodBannerCtaLabel, resolveFoodBannerAction, type FoodBannerAction } from '@/lib/foodBannerActions';
import '@/styles/foodBanners.css';

export interface FoodBanner {
  id: number;
  title: string;
  subtitle?: string;
  banner_text?: string;
  image_url?: string;
  button_text?: string;
  button_url?: string;
}

function BannerImage({ source }: { source: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl('');
    resolveImageUrl(source).then(value => { if (alive) setUrl(value || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [source]);
  return url ? <img src={url} alt="" loading="lazy" className="food-campaign__image" onError={() => setUrl('')} /> : null;
}

export function FoodBannerCard({ banner, onAction }: { banner: FoodBanner; onAction: (action: FoodBannerAction, banner: FoodBanner) => void }) {
  const action = resolveFoodBannerAction(banner);
  const label = foodBannerCtaLabel(action, banner.button_text);
  const eyebrow = action.type === 'promo' ? `Промокод ${action.code}` : action.type === 'gifts' ? 'К вашему заказу' : action.type === 'category' ? 'Выберите своё' : 'DAM ALEM 2.0 рекомендует';
  return (
    <button type="button" className={`food-campaign food-campaign--${action.type}`} onClick={() => onAction(action, banner)} aria-label={`${banner.title}. ${label}`} data-testid={`food-banner-${banner.id}`}>
      {banner.image_url ? <BannerImage source={banner.image_url} /> : <span className="food-campaign__decoration" aria-hidden="true" />}
      <span className="food-campaign__shade" />
      <span className="food-campaign__content">
        <span className="food-campaign__eyebrow">{eyebrow}</span>
        <span className="food-campaign__title">{banner.title}</span>
        {(banner.subtitle || banner.banner_text) && <span className="food-campaign__subtitle">{banner.subtitle || banner.banner_text}</span>}
        <span className="food-campaign__cta">{label}{action.type === 'link' ? <ExternalLink aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</span>
      </span>
    </button>
  );
}

export default function DamAlemPromoBanners({ banners, onAction }: { banners: FoodBanner[]; onAction: (action: FoodBannerAction, banner: FoodBanner) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const sync = () => {
    const element = track.current;
    if (!element) return;
    const children = Array.from(element.children) as HTMLElement[];
    let nearest = 0, distance = Infinity;
    children.forEach((child, index) => {
      const delta = Math.abs(child.offsetLeft - (children[0]?.offsetLeft || 0) - element.scrollLeft);
      if (delta < distance) { nearest = index; distance = delta; }
    });
    setPosition(nearest);
    setAtEnd(element.scrollLeft + element.clientWidth >= element.scrollWidth - 4);
  };
  useEffect(() => {
    sync();
    const observer = new ResizeObserver(sync);
    if (track.current) observer.observe(track.current);
    return () => observer.disconnect();
  }, [banners.length]);
  if (!banners.length) return null;
  const move = (delta: number) => {
    const element = track.current;
    if (!element) return;
    const card = element.children[Math.min(banners.length - 1, Math.max(0, position + delta))] as HTMLElement;
    const first = element.children[0] as HTMLElement;
    element.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return (
    <section className="food-campaigns" aria-label="Предложения DAM ALEM 2.0">
      <div className="food-campaigns__heading">
        <div><p>К хорошему заказу</p><h2>Есть повод попробовать</h2></div>
        {banners.length > 1 && <div className="food-campaigns__controls">
          <button type="button" aria-label="Предыдущие предложения" disabled={position === 0} onClick={() => move(-1)}><ArrowLeft /></button>
          <button type="button" aria-label="Следующие предложения" disabled={atEnd} onClick={() => move(1)}><ArrowRight /></button>
        </div>}
      </div>
      <div ref={track} onScroll={sync} className="food-campaigns__track" tabIndex={0} aria-label="Листайте предложения" data-testid="food-banner-track">
        {banners.map(banner => <FoodBannerCard key={banner.id} banner={banner} onAction={onAction} />)}
      </div>
      {banners.length > 1 && <p className="food-campaigns__hint">Предложений: {banners.length} · нажмите на карточку, чтобы открыть</p>}
    </section>
  );
}
