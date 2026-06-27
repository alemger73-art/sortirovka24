/**
 * Optional Sentry for production. No-op when VITE_SENTRY_DSN is unset.
 * @sentry/react is optional — build works without it installed.
 */

const TRANSIENT_NETWORK =
  /503|502|504|temporarily unavailable|service unavailable|econnrefused|enotfound|econnreset|failed to fetch|load failed|network error|fetch failed/i;

function sentryDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || dsn.includes('$$')) return undefined;
  return dsn;
}

export function isTransientNetworkError(reason: unknown): boolean {
  const msg = String(
    (reason as { message?: string })?.message || reason || '',
  );
  return TRANSIENT_NETWORK.test(msg);
}

export function initMonitoring(): void {
  if (!sentryDsn()) return;

  void import(/* @vite-ignore */ '@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn(),
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
  if (!sentryDsn()) {
    console.error('[error]', error, context);
    return;
  }

  void import(/* @vite-ignore */ '@sentry/react')
    .then((Sentry) => {
      Sentry.captureException(error, context ? { extra: context } : undefined);
    })
    .catch(() => {
      console.error('[error]', error, context);
    });
}
