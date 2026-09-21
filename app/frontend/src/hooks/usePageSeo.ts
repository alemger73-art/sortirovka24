import { useEffect } from 'react';

const SITE_URL = 'https://www.sortirovka24.kz';
const FALLBACK_IMAGE = `${SITE_URL}/icon-512.png`;

type PageSeo = {
  title?: string;
  description?: string;
  image?: string | null;
  type?: 'website' | 'article';
  structuredData?: Record<string, unknown> | null;
};

function setMeta(selector: string, value: string) {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value);
}

function absoluteImage(value?: string | null): string {
  if (!value) return FALLBACK_IMAGE;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${SITE_URL}${value}`;
  return FALLBACK_IMAGE;
}

/** Update metadata after API-backed detail pages load during client navigation. */
export function usePageSeo({ title, description, image, type = 'website', structuredData }: PageSeo) {
  useEffect(() => {
    if (!title || !description) return;
    const canonical = `${SITE_URL}${window.location.pathname.replace(/\/+$/, '') || '/'}`;
    const fullTitle = title.includes('Sortirovka 24') ? title : `${title} | Sortirovka 24`;
    const resolvedImage = absoluteImage(image);

    document.title = fullTitle;
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="robots"]', 'index, follow, max-image-preview:large');
    setMeta('meta[property="og:title"]', fullTitle);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:type"]', type);
    setMeta('meta[property="og:url"]', canonical);
    setMeta('meta[property="og:image"]', resolvedImage);
    setMeta('meta[name="twitter:title"]', fullTitle);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="twitter:image"]', resolvedImage);
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonical);

    document.getElementById('dynamic-seo-jsonld')?.remove();
    if (structuredData) {
      const script = document.createElement('script');
      script.id = 'dynamic-seo-jsonld';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(structuredData).replace(/<\//g, '<\\/');
      document.head.appendChild(script);
    }
  }, [description, image, structuredData, title, type]);
}
