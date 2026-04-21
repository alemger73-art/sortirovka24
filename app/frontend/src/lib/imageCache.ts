/**
 * Client-side image preloading and caching system.
 *
 * Provides:
 * - In-memory cache tracking which images are already loaded
 * - Preload functions that use <link rel="preload"> and Image() objects
 * - Batch preloading with concurrency control
 * - Integration with requestIdleCallback for non-blocking preloads
 * - Connection-aware loading (skips on slow/save-data)
 */

// ─── In-memory loaded image tracker ─────────────────────────────
const loadedImages = new Set<string>();
const loadingImages = new Map<string, Promise<void>>();

/** Check if an image URL has already been loaded/cached by the browser */
export function isImageCached(url: string): boolean {
  return loadedImages.has(url);
}

/** Mark an image as loaded */
export function markImageLoaded(url: string): void {
  loadedImages.add(url);
}

/** Get count of cached images (for debugging) */
export function getCachedImageCount(): number {
  return loadedImages.size;
}

// ─── Connection check ───────────────────────────────────────────
function shouldPreload(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  if (conn) {
    if (conn.saveData) return false;
    if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return false;
  }
  return true;
}

// ─── Single image preload ───────────────────────────────────────
/**
 * Preload a single image. Returns a promise that resolves when loaded.
 * Uses Image() object which triggers browser caching.
 * Deduplicates concurrent requests for the same URL.
 */
export function preloadImage(url: string): Promise<void> {
  if (!url || loadedImages.has(url)) return Promise.resolve();

  // Deduplicate in-flight requests
  const existing = loadingImages.get(url);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      loadedImages.add(url);
      loadingImages.delete(url);
      resolve();
    };
    img.onerror = () => {
      loadingImages.delete(url);
      resolve(); // Don't reject — preload failure is non-critical
    };
    img.src = url;
  });

  loadingImages.set(url, promise);
  return promise;
}

// ─── Batch preload with concurrency ─────────────────────────────
/**
 * Preload multiple images with concurrency control.
 * @param urls - Array of image URLs to preload
 * @param concurrency - Max simultaneous loads (default 3)
 */
export async function preloadImages(
  urls: string[],
  concurrency: number = 3
): Promise<void> {
  if (!shouldPreload()) return;

  // Filter out already cached and empty URLs
  const toLoad = urls.filter(url => url && !loadedImages.has(url));
  if (toLoad.length === 0) return;

  // Process in chunks
  for (let i = 0; i < toLoad.length; i += concurrency) {
    const chunk = toLoad.slice(i, i + concurrency);
    await Promise.all(chunk.map(preloadImage));
  }
}

// ─── Idle preload ───────────────────────────────────────────────
/**
 * Schedule image preloading during browser idle time.
 * Non-blocking — won't affect page interactivity.
 */
export function preloadImagesOnIdle(urls: string[], concurrency: number = 2): void {
  if (!shouldPreload()) return;

  const toLoad = urls.filter(url => url && !loadedImages.has(url));
  if (toLoad.length === 0) return;

  const schedule = (fn: () => void) => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(fn, { timeout: 8000 });
    } else {
      setTimeout(fn, 200);
    }
  };

  // Split into small batches and schedule each during idle
  for (let i = 0; i < toLoad.length; i += concurrency) {
    const chunk = toLoad.slice(i, i + concurrency);
    const delay = Math.floor(i / concurrency) * 500; // Stagger batches

    setTimeout(() => {
      schedule(() => {
        chunk.forEach(preloadImage);
      });
    }, delay);
  }
}

// ─── Critical image preload via <link> ──────────────────────────
/**
 * Add <link rel="preload"> to document head for critical above-the-fold images.
 * This tells the browser to start downloading these images immediately,
 * even before the React component tree renders.
 */
export function preloadCriticalImages(urls: string[]): void {
  if (typeof document === 'undefined') return;

  urls.forEach(url => {
    if (!url) return;
    // Check if already preloaded
    const existing = document.querySelector(`link[rel="preload"][href="${url}"]`);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    // Add crossorigin for CDN images
    if (url.includes('cdn.') || url.includes('.oss.')) {
      link.crossOrigin = 'anonymous';
    }
    document.head.appendChild(link);
  });
}

// ─── Extract image URLs from API data ───────────────────────────
/**
 * Extract image URLs from an array of items (API response).
 * Looks for common image fields: image_url, photo_url, cover_image, gallery_images.
 */
export function extractImageUrls(
  items: any[],
  resolveUrl?: (key: string) => string | null
): string[] {
  const urls: string[] = [];

  for (const item of items) {
    const imageFields = [
      'image_url', 'photo_url', 'cover_image', 'hero_image',
      'thumbnail_url', 'avatar_url', 'banner_image',
    ];

    for (const field of imageFields) {
      const val = item?.[field];
      if (!val || typeof val !== 'string') continue;

      if (val.startsWith('http')) {
        urls.push(val);
      } else if (resolveUrl) {
        const resolved = resolveUrl(val);
        if (resolved) urls.push(resolved);
      }
    }

    // Handle gallery_images (comma-separated or JSON array)
    const gallery = item?.gallery_images;
    if (gallery && typeof gallery === 'string') {
      try {
        const parsed = JSON.parse(gallery);
        if (Array.isArray(parsed)) {
          parsed.forEach((g: string) => {
            if (g?.startsWith('http')) urls.push(g);
            else if (g && resolveUrl) {
              const resolved = resolveUrl(g);
              if (resolved) urls.push(resolved);
            }
          });
        }
      } catch {
        // Try comma-separated
        gallery.split(',').forEach(g => {
          const trimmed = g.trim();
          if (trimmed.startsWith('http')) urls.push(trimmed);
          else if (trimmed && resolveUrl) {
            const resolved = resolveUrl(trimmed);
            if (resolved) urls.push(resolved);
          }
        });
      }
    }
  }

  return [...new Set(urls)]; // Deduplicate
}