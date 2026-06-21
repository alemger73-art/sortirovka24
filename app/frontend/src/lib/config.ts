// Runtime configuration
//
// In production the frontend is served from the same domain as the backend,
// so an empty base URL (relative paths like /api/v1/...) works correctly.
// In dev mode Vite's proxy forwards /api → http://localhost:8000.
//
// Capacitor native builds use .env.mobile with an absolute VITE_API_BASE_URL.

import { Capacitor } from '@capacitor/core';

const DEFAULT_NATIVE_API = 'https://sortirovka24-production-8788.up.railway.app';

function resolveBaseURL(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

  if (Capacitor.isNativePlatform()) {
    const nativeBase = envUrl && !envUrl.includes('$$') && envUrl !== 'undefined'
      ? envUrl
      : DEFAULT_NATIVE_API;
    return nativeBase.replace(/\/+$/, '');
  }

  if (envUrl && !envUrl.includes('$$') && envUrl !== 'undefined') {
    return envUrl.replace(/\/+$/, '');
  }

  return '';
}

const _baseURL = resolveBaseURL();

export function getAPIBaseURL(): string {
  return _baseURL;
}

/** Absolute API path — works on web (relative) and native (Railway). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = _baseURL.replace(/\/+$/, '');
  return base ? `${base}${normalized}` : normalized;
}

/** Turn backend-relative service URLs into absolute (required for Capacitor uploads). */
export function resolveServiceUrl(urlOrPath: string): string {
  const s = (urlOrPath || '').trim();
  if (!s) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return apiUrl(s.startsWith('/') ? s : `/${s}`);
}

// Kept for backward compatibility
export function getConfig() {
  return { API_BASE_URL: _baseURL };
}

export async function loadRuntimeConfig(): Promise<void> {
  // No-op — configuration is resolved statically from env vars.
  // Kept for backward compatibility with callers.
}

export const config = {
  get API_BASE_URL() {
    return _baseURL;
  },
};

/** Support / business WhatsApp (digits only for wa.me links). */
export const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined)?.replace(/\D/g, '') || '77470304096';

export function whatsappUrl(text?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}