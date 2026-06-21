/**
 * Optional Sentry for production. No-op when VITE_SENTRY_DSN is unset.
 */

const TRANSIENT_NETWORK =
  /503|502|504|temporarily unavailable|service unavailable|econnrefused|enotfound|econnreset|failed to fetch|load failed|network error|fetch failed/i;

export function isTransientNetworkError(reason: unknown): boolean {
  const msg = String(
    (reason as { message?: string })?.message || reason || '',
  );
  return TRANSIENT_NETWORK.test(msg);
}

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || dsn.includes('$$')) return;

  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        release: 'sortirovka24@2.1.0',
        tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
        beforeSend(event, hint) {
          const err = hint.originalException;
          if (isTransientNetworkError(err)) return null;
          return event;
        },
      });
    })
    .catch((err) => {
      console.warn('[monitoring] Sentry init skipped:', err);
    });
}

export function captureError(error: unknown, context?: Record<string, string>): void {
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.captureException(error, context ? { extra: context } : undefined);
    })
    .catch(() => {
      console.error('[error]', error, context);
    });
}
