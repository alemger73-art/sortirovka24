// Runtime configuration
//
// In production the frontend is served from the same domain as the backend,
// so an empty base URL (relative paths like /api/v1/...) works correctly.
// In dev mode Vite's proxy forwards /api → http://localhost:8000.
//
// VITE_API_BASE_URL is baked at build time. If it contains an unresolved
// placeholder ($$…$$) or is missing, we fall back to "" (same-origin).

function resolveBaseURL(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

  // If the env var is set and doesn't contain unresolved placeholders, use it
  if (envUrl && !envUrl.includes('$$') && envUrl !== 'undefined') {
    // Strip trailing slash for consistency
    return envUrl.replace(/\/+$/, '');
  }

  // In production: same-origin (empty string) — /api/... goes to the same domain
  // In dev: Vite proxy handles /api → localhost:8000
  return '';
}

const _baseURL = resolveBaseURL();

export function getAPIBaseURL(): string {
  return _baseURL;
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