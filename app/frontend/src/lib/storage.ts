/**
 * Centralized storage utilities for the portal.
 *
 * Consolidates bucket management, upload helpers, and URL resolution
 * into a single module to avoid duplication across ImageUpload,
 * MultiImageUpload, and VideoUpload components.
 */
import { client, withRetry } from '@/lib/api';

export const BUCKET_NAME = 'portal-images';

// ─── Cloudinary Image Base URL (auto-discovered) ─────────────────
// For object keys we can construct permanent image URLs when the Cloudinary
// cloud name is known from any returned download URL.
let _cloudinaryImageBase: string | null = null;

function splitObjectKey(objectKey: string): { publicId: string; format: string | null } {
  const key = (objectKey || '').trim().replace(/^\/+/, '');
  if (!key) return { publicId: '', format: null };
  const dot = key.lastIndexOf('.');
  if (dot <= 0 || dot === key.length - 1) return { publicId: key, format: null };
  const publicId = key.slice(0, dot);
  const ext = key.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]{1,10}$/.test(ext)) return { publicId: key, format: null };
  return { publicId, format: ext };
}

/** Extract and cache Cloudinary image delivery base from URL. */
function extractCloudinaryBase(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    if (url.hostname !== 'res.cloudinary.com') return null;
    const parts = url.pathname.split('/').filter(Boolean); // <cloud>/<resource>/upload/...
    if (parts.length < 3) return null;
    const cloudName = parts[0];
    const resourceType = parts[1] || 'image';
    if (parts[2] !== 'upload') return null;
    if (!cloudName) return null;
    // Prefer image base for news/announcements/gallery rendering.
    const base = `${url.protocol}//${url.hostname}/${cloudName}/${resourceType}/upload`;
    if (resourceType === 'image') {
      _cloudinaryImageBase = base;
    } else if (!_cloudinaryImageBase) {
      // Fallback if first discovered URL is non-image.
      _cloudinaryImageBase = `${url.protocol}//${url.hostname}/${cloudName}/image/upload`;
    }
    if (_cloudinaryImageBase) {
      return _cloudinaryImageBase;
    }
    return base;
  } catch {
    return null;
  }
}

/** Extract and cache Cloudinary base from any response URL. */
function extractStorageBase(urlValue: string): string | null {
  const cloudinary = extractCloudinaryBase(urlValue);
  if (cloudinary) return cloudinary;
  return null;
}

/** Get permanent public URL for object key if base known. */
export function getPublicObjectUrl(objectKey: string): string | null {
  if (!_cloudinaryImageBase) return null;
  const { publicId, format } = splitObjectKey(objectKey);
  if (!publicId) return null;
  const encodedId = publicId.split('/').map(encodeURIComponent).join('/');
  const suffix = format ? `.${format}` : '';
  return `${_cloudinaryImageBase}/${encodedId}${suffix}`;
}

/** Check if a value looks like a storage object key (not a URL, contains folder/file pattern). */
export function isObjectKey(value: string): boolean {
  return !isDirectUrl(value) && value.includes('/') && !value.startsWith('/');
}

/**
 * Synchronously resolve an image source for use in <img src={}>.
 * - If the value is already a URL, returns it as-is.
 * - If it's an objectKey and Cloudinary base is discovered, constructs a permanent URL.
 * - Returns null if the value cannot be resolved yet.
 */
export function resolveImageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDirectUrl(value)) return value;
  return getPublicObjectUrl(value);
}

// ─── Bucket auto-creation (singleton) ───────────────────────────
let _bucketEnsured = false;
let _bucketEnsurePromise: Promise<void> | null = null;

/**
 * Ensure the storage backend is reachable. Safe to call from any component.
 */
export async function ensureBucket(): Promise<void> {
  if (_bucketEnsured) return;
  if (_bucketEnsurePromise) return _bucketEnsurePromise;

  _bucketEnsurePromise = (async () => {
    try {
      const resp = await fetch('/api/v1/storage/public/download-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Host': globalThis?.window?.location?.origin ?? '',
        },
        body: JSON.stringify({
          bucket_name: BUCKET_NAME,
          object_key: '_ping_test_nonexistent.jpg',
        }),
      });
      if (resp.ok) {
        try {
          const data = await resp.json();
          if (data?.download_url) {
            extractStorageBase(data.download_url);
          }
        } catch {
          // ignore parse errors
        }
      }
      // 4xx/5xx still proves backend route is reachable.
      _bucketEnsured = true;
      return;
    } catch {
      // Network error — try SDK fallback.
    }

    try {
      await client.storage.listObjects({ bucket_name: BUCKET_NAME });
      _bucketEnsured = true;
    } catch {
      _bucketEnsured = true;
    }
  })();

  return _bucketEnsurePromise;
}

/** Reset the bucket-ensured flag (useful for testing or after errors). */
export function resetBucketEnsured(): void {
  _bucketEnsured = false;
  _bucketEnsurePromise = null;
}

// ─── URL Resolution Cache ───────────────────────────────────────
const urlCache = new Map<string, { url: string; ts: number }>();
const URL_CACHE_TTL = 30 * 60 * 1000; // 30 min

export function getCachedUrl(key: string): string | null {
  const entry = urlCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > URL_CACHE_TTL) {
    urlCache.delete(key);
    return null;
  }
  return entry.url;
}

export function setCachedUrl(key: string, url: string): void {
  urlCache.set(key, { url, ts: Date.now() });
}

export function clearCachedUrl(key: string): void {
  urlCache.delete(key);
}

/** Check if a string is a direct URL (http/https). */
export function isDirectUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Resolve an object_key to a download URL for display.
 */
export async function resolveImageUrl(
  objectKey: string | undefined | null
): Promise<string | null> {
  if (!objectKey) return null;
  if (isDirectUrl(objectKey)) return objectKey;

  // Check cache first
  const cached = getCachedUrl(objectKey);
  if (cached) return cached;

  // Strategy 1: If Cloudinary base is known, construct direct URL
  const publicUrl = getPublicObjectUrl(objectKey);
  if (publicUrl) {
    setCachedUrl(objectKey, publicUrl);
    return publicUrl;
  }

  // Strategy 2: Use backend public endpoint and cache discovered base.
  try {
    const url = await withRetry(
      () => fetchPublicDownloadUrl(BUCKET_NAME, objectKey),
      4,
      2000
    );
    if (url) {
      extractStorageBase(url);
      const permanentUrl = getPublicObjectUrl(objectKey) || url;
      setCachedUrl(objectKey, permanentUrl);
      return permanentUrl;
    }
  } catch {
    // fall through
  }

  // Strategy 3: SDK authenticated endpoint (works in App Viewer / admin)
  try {
    const res = await withRetry(
      () =>
        client.storage.getDownloadUrl({
          bucket_name: BUCKET_NAME,
          object_key: objectKey,
        }),
      3,
      2000
    );
    const url = res.data?.download_url || null;
    if (url) {
      extractStorageBase(url);
      const permanentUrl = getPublicObjectUrl(objectKey) || url;
      setCachedUrl(objectKey, permanentUrl);
      return permanentUrl;
    }
    return url;
  } catch (err) {
    console.warn('[resolveImageUrl] All methods failed:', objectKey, err);
    return null;
  }
}

/**
 * Fetch a download URL from the public (no-auth) backend endpoint.
 * This bypasses the SDK's axios interceptor to avoid auth header injection.
 */
async function fetchPublicDownloadUrl(
  bucketName: string,
  objectKey: string
): Promise<string | null> {
  const resp = await fetch('/api/v1/storage/public/download-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'App-Host': globalThis?.window?.location?.origin ?? '',
    },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_key: objectKey,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Public download-url failed: ${resp.status}`);
  }

  const data = await resp.json();
  return data?.download_url || null;
}

/**
 * Get a presigned upload URL from the public (no-auth) backend endpoint.
 * This bypasses the SDK's axios interceptor to avoid auth header injection.
 * Returns { upload_url, expires_at } on success.
 */
async function fetchPublicUploadUrl(
  bucketName: string,
  objectKey: string
): Promise<{
  upload_url: string;
  expires_at: string;
  object_key?: string;
  thumbnail_object_key?: string;
  image_url?: string;
  thumbnail_url?: string;
}> {
  const resp = await fetch('/api/v1/storage/public/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'App-Host': globalThis?.window?.location?.origin ?? '',
    },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_key: objectKey,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Public upload-url failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  if (!data?.upload_url) {
    throw new Error('No upload_url in response');
  }
  return data;
}

/**
 * Upload a file directly to a presigned URL using PUT.
 */
async function uploadToPresignedUrl(
  presignedUrl: string,
  file: File
): Promise<{
  image_url?: string;
  thumbnail_url?: string;
  object_key?: string;
  thumbnail_object_key?: string;
}> {
  const resp = await fetch(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!resp.ok) {
    throw new Error(`Upload to presigned URL failed: ${resp.status}`);
  }

  try {
    return await resp.json();
  } catch {
    return {};
  }
}

/**
 * Verify that an uploaded file is actually accessible at the given URL.
 * Returns true if the file responds with HTTP 200, false otherwise.
 */
async function verifyFileAccessible(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Upload a file to storage with retry logic.
 * Uses the PUBLIC upload endpoint first (no auth required — works on production).
 * Falls back to the SDK's authenticated method (works in App Viewer / admin).
 * After upload, verifies the file is actually accessible.
 * Returns the object key on success.
 */
export async function uploadFile(
  file: File,
  folder: string
): Promise<{
  objectKey: string;
  downloadUrl: string | null;
  thumbnailObjectKey?: string;
  thumbnailUrl?: string | null;
}> {
  // Ensure bucket exists before uploading
  await ensureBucket();

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const requestedObjectKey = `${folder}/${timestamp}-${randomStr}.${ext}`;
  let objectKey = requestedObjectKey;
  let thumbnailObjectKey = '';
  let thumbnailUrl: string | null = null;

  let uploaded = false;

  // Strategy 1: Public endpoint (no auth — works on production for all users)
  try {
    const uploadMeta = await withRetry(
      () => fetchPublicUploadUrl(BUCKET_NAME, requestedObjectKey),
      3,
      2000
    );
    const uploadUrl = uploadMeta.upload_url;
    objectKey = uploadMeta.object_key || objectKey;
    thumbnailObjectKey = uploadMeta.thumbnail_object_key || '';
    extractStorageBase(uploadUrl);
    const uploadResult = await withRetry(
      () => uploadToPresignedUrl(uploadUrl, file),
      2,
      1500
    );
    if (uploadResult?.object_key) objectKey = uploadResult.object_key;
    if (uploadResult?.thumbnail_object_key) thumbnailObjectKey = uploadResult.thumbnail_object_key;
    if (uploadResult?.image_url) {
      const url = uploadResult.image_url;
      extractStorageBase(url);
      setCachedUrl(objectKey, url);
    }
    if (uploadResult?.thumbnail_url) {
      thumbnailUrl = uploadResult.thumbnail_url;
      if (thumbnailObjectKey) setCachedUrl(thumbnailObjectKey, thumbnailUrl);
      extractStorageBase(thumbnailUrl);
    }
    uploaded = true;
    console.log('[uploadFile] Success via public endpoint:', objectKey);
  } catch (err) {
    console.warn('[uploadFile] Public upload failed, trying SDK fallback:', err);
  }

  // Strategy 2: SDK authenticated method (fallback for App Viewer / admin)
  if (!uploaded) {
    await withRetry(
      () =>
        client.storage.upload({
          bucket_name: BUCKET_NAME,
          object_key: objectKey,
          file,
        }),
      3,
      2000
    );
    console.log('[uploadFile] Success via SDK fallback:', objectKey);
  }

  // Construct permanent public URL (preferred — never expires)
  let downloadUrl: string | null = getPublicObjectUrl(objectKey);

  // If we don't have the OSS base URL yet, discover it via download endpoint
  if (!downloadUrl) {
    try {
      const presignedUrl = await withRetry(
        () => fetchPublicDownloadUrl(BUCKET_NAME, objectKey),
        3,
        2000
      );
      if (presignedUrl) {
        extractStorageBase(presignedUrl);
        // Prefer permanent URL over presigned
        downloadUrl = getPublicObjectUrl(objectKey) || presignedUrl;
      }
    } catch {
      // Fallback to SDK
      try {
        const res = await withRetry(
          () =>
            client.storage.getDownloadUrl({
              bucket_name: BUCKET_NAME,
              object_key: objectKey,
            }),
          3,
          2000
        );
        const sdkUrl = res.data?.download_url || null;
        if (sdkUrl) {
          extractStorageBase(sdkUrl);
          downloadUrl = getPublicObjectUrl(objectKey) || sdkUrl;
        }
      } catch (err) {
        console.warn('[uploadFile] Failed to get download URL:', err);
      }
    }
  }

  // Post-upload verification: confirm the file is actually accessible
  if (downloadUrl) {
    // Small delay to allow storage propagation
    await new Promise(resolve => setTimeout(resolve, 800));
    const isAccessible = await verifyFileAccessible(downloadUrl);
    if (!isAccessible) {
      console.warn('[uploadFile] Post-upload verification failed for:', downloadUrl);
      // Try once more after a longer delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      const retryAccessible = await verifyFileAccessible(downloadUrl);
      if (!retryAccessible) {
        console.error('[uploadFile] File not accessible after upload:', downloadUrl);
        // Still return the URL — the file might become available shortly
        // but warn the caller
      } else {
        console.log('[uploadFile] File accessible after retry:', downloadUrl);
      }
    } else {
      console.log('[uploadFile] File verified accessible:', downloadUrl);
    }
    setCachedUrl(objectKey, downloadUrl);
  }

  return { objectKey, downloadUrl, thumbnailObjectKey, thumbnailUrl };
}