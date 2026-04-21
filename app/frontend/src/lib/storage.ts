/**
 * Centralized storage utilities for the portal.
 *
 * Consolidates bucket management, upload helpers, and URL resolution
 * into a single module to avoid duplication across ImageUpload,
 * MultiImageUpload, and VideoUpload components.
 */
import { client, withRetry } from '@/lib/api';

export const BUCKET_NAME = 'portal-images';

// ─── OSS Base URL (permanent public access) ─────────────────────
// Objects in public buckets can be accessed directly without presigned params.
// We pre-initialize with the known OSS base URL so images resolve immediately
// on page load without waiting for any API call. This is critical for the
// external site where the backend may be cold on first visit.
// The URL is also auto-discovered from presigned URLs as a self-healing mechanism.
let _ossBaseUrl: string | null = 'https://a405a189a97f36b140db28b533475909.oss.atoms.dev';

/** Extract and cache the OSS base URL from a presigned URL. */
function extractOssBaseUrl(presignedUrl: string): string | null {
  try {
    const url = new URL(presignedUrl);
    // Pattern: https://{hash}.oss.atoms.dev/{objectKey}?X-Amz-...
    if (url.hostname.endsWith('.oss.atoms.dev')) {
      const base = `${url.protocol}//${url.hostname}`;
      _ossBaseUrl = base;
      return base;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Get the permanent public URL for an object key. Returns null if base URL unknown. */
export function getPublicObjectUrl(objectKey: string): string | null {
  if (!_ossBaseUrl) return null;
  // Ensure no double slashes
  const key = objectKey.startsWith('/') ? objectKey.slice(1) : objectKey;
  return `${_ossBaseUrl}/${key}`;
}

/** Check if a value looks like a storage object key (not a URL, contains folder/file pattern). */
export function isObjectKey(value: string): boolean {
  return !isDirectUrl(value) && value.includes('/') && !value.startsWith('/');
}

/**
 * Synchronously resolve an image source for use in <img src={}>.
 * - If the value is already a URL, returns it as-is.
 * - If it's an objectKey and we know the OSS base URL, constructs a permanent URL.
 * - Returns null if the value is empty or cannot be resolved.
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
 * Ensure the storage bucket exists. Safe to call from any component —
 * runs at most once and caches the result globally.
 *
 * On production, the bucket is created by the backend on startup,
 * so we use a lightweight public endpoint probe instead of authenticated
 * SDK calls that would fail with 401 for unauthenticated users.
 */
export async function ensureBucket(): Promise<void> {
  if (_bucketEnsured) return;
  if (_bucketEnsurePromise) return _bucketEnsurePromise;

  _bucketEnsurePromise = (async () => {
    // Strategy 1: Try a lightweight public download-url call to verify bucket exists.
    // This doesn't require auth and works on production.
    try {
      const resp = await fetch('/api/v1/storage/public/download-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Host': globalThis?.window?.location?.origin ?? '',
        },
        body: JSON.stringify({
          bucket_name: BUCKET_NAME,
          object_key: '_ping_test_nonexistent.txt',
        }),
      });
      // Any response (even 400/404) means the backend is reachable
      // and the bucket routing works. Only network errors are a concern.
      if (resp.ok || resp.status === 400 || resp.status === 404 || resp.status === 500) {
        // Try to extract OSS base URL from a successful response
        if (resp.ok) {
          try {
            const data = await resp.json();
            if (data?.download_url) {
              extractOssBaseUrl(data.download_url);
            }
          } catch {
            // ignore JSON parse errors
          }
        }
        _bucketEnsured = true;
        return;
      }
    } catch {
      // Network error — fall through to SDK method
    }

    // Strategy 2: SDK authenticated method (works in App Viewer / admin)
    try {
      await client.storage.listObjects({ bucket_name: BUCKET_NAME });
      _bucketEnsured = true;
    } catch (err) {
      const msg = String(err).toLowerCase();
      if (
        msg.includes('not found') ||
        msg.includes('not exist') ||
        msg.includes('no such') ||
        msg.includes('404')
      ) {
        try {
          await client.storage.createBucket({
            bucket_name: BUCKET_NAME,
            visibility: 'public',
          });
          console.log('[Storage] Created bucket:', BUCKET_NAME);
        } catch (createErr) {
          console.warn('[Storage] Bucket create failed (likely already exists):', createErr);
        }
      } else {
        console.warn('[Storage] Could not verify bucket, proceeding anyway:', msg);
      }
      // Always mark as ensured — don't block uploads
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
 *
 * Strategy (in order):
 * 1. If it's already a direct URL (http/https), return as-is.
 * 2. If we know the OSS base URL, construct a permanent public URL directly
 *    (no API call needed — the bucket is public).
 * 3. Fall back to the presigned download endpoint (and extract the OSS base
 *    URL from the response for future use).
 *
 * Supports direct URLs (returns them as-is).
 */
export async function resolveImageUrl(
  objectKey: string | undefined | null
): Promise<string | null> {
  if (!objectKey) return null;
  if (isDirectUrl(objectKey)) return objectKey;

  // Check cache first
  const cached = getCachedUrl(objectKey);
  if (cached) return cached;

  // Strategy 1: If we know the OSS base URL, construct permanent public URL directly
  const publicUrl = getPublicObjectUrl(objectKey);
  if (publicUrl) {
    setCachedUrl(objectKey, publicUrl);
    return publicUrl;
  }

  // Strategy 2: Discover the OSS base URL via the presigned download endpoint
  try {
    const url = await withRetry(
      () => fetchPublicDownloadUrl(BUCKET_NAME, objectKey),
      4,
      2000
    );
    if (url) {
      // Extract and cache the OSS base URL for future permanent URL construction
      extractOssBaseUrl(url);
      // Use the permanent URL (without presigned params) instead of the expiring one
      const permanentUrl = getPublicObjectUrl(objectKey) || url;
      setCachedUrl(objectKey, permanentUrl);
      return permanentUrl;
    }
  } catch (err) {
    console.warn('[resolveImageUrl] Public endpoint failed, trying SDK:', objectKey, err);
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
      extractOssBaseUrl(url);
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
): Promise<{ upload_url: string; expires_at: string }> {
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
): Promise<void> {
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
): Promise<{ objectKey: string; downloadUrl: string | null }> {
  // Ensure bucket exists before uploading
  await ensureBucket();

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const objectKey = `${folder}/${timestamp}-${randomStr}.${ext}`;

  let uploaded = false;

  // Strategy 1: Public endpoint (no auth — works on production for all users)
  try {
    const { upload_url } = await withRetry(
      () => fetchPublicUploadUrl(BUCKET_NAME, objectKey),
      3,
      2000
    );
    // Extract OSS base URL from the upload URL for permanent URL construction
    extractOssBaseUrl(upload_url);
    await withRetry(
      () => uploadToPresignedUrl(upload_url, file),
      2,
      1500
    );
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
        extractOssBaseUrl(presignedUrl);
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
          extractOssBaseUrl(sdkUrl);
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

  return { objectKey, downloadUrl };
}