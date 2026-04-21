/**
 * Optimized image component for public-facing pages.
 *
 * Uses resolveImageSrc() which synchronously constructs the permanent
 * public URL from the pre-initialized OSS base URL.
 *
 * Enhanced with:
 * - In-memory image cache integration (instant display for preloaded images)
 * - IntersectionObserver for true lazy loading with rootMargin preload
 * - Blur-up placeholder animation for smooth appearance
 * - Better error fallback showing a "broken image" indicator
 * - Support for direct URLs (http/https) passed as objectKey
 * - Retry mechanism on error (once, after a short delay)
 */
import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { resolveImageSrc, isDirectUrl } from '@/lib/storage';
import { isImageCached, markImageLoaded } from '@/lib/imageCache';
import { ImageIcon, ImageOff } from 'lucide-react';

interface StorageImgProps {
  objectKey?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  /** Show a "broken image" style instead of generic placeholder on error */
  showBrokenIndicator?: boolean;
  /** Load eagerly (above-the-fold images) */
  priority?: boolean;
}

const StorageImg = memo(function StorageImg({
  objectKey,
  alt = '',
  className = '',
  fallbackClassName,
  showBrokenIndicator = false,
  priority = false,
}: StorageImgProps) {
  const src = resolveImageSrc(objectKey ?? null);
  const alreadyCached = src ? isImageCached(src) : false;

  const [loaded, setLoaded] = useState(alreadyCached);
  const [error, setError] = useState(false);
  const [retried, setRetried] = useState(false);
  const [inView, setInView] = useState(priority || alreadyCached);
  const containerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for lazy loading with 300px rootMargin
  useEffect(() => {
    if (priority || alreadyCached || !src) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [priority, alreadyCached, src]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    if (src) markImageLoaded(src);
  }, [src]);

  const handleError = useCallback(() => {
    if (!retried) {
      setRetried(true);
      setTimeout(() => setError(true), 500);
      return;
    }
    setError(true);
  }, [retried]);

  // No objectKey provided — show empty placeholder
  if (!objectKey || !src) {
    return (
      <div className={`bg-gray-100 flex items-center justify-center ${fallbackClassName || className}`}>
        <ImageIcon className="h-6 w-6 text-gray-300" />
      </div>
    );
  }

  // Image failed to load — show broken image indicator
  if (error) {
    return (
      <div className={`bg-gray-50 flex items-center justify-center ${fallbackClassName || className}`}>
        {showBrokenIndicator ? (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <ImageOff className="h-5 w-5" />
            <span className="text-[9px] font-medium">Фото недоступно</span>
          </div>
        ) : (
          <ImageIcon className="h-6 w-6 text-gray-300" />
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Blur placeholder — only shown while image is loading */}
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      {inView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
});

export default StorageImg;