// Transient network / cold-start patterns — suppress SDK overlay only, still log.
const TRANSIENT =
  /503|502|504|temporarily unavailable|service unavailable|<!doctype|<html|server error|dns|timeout|econnrefused|enotfound|econnreset|failed to fetch|load failed|not ready|lambda|balancer|fetch failed|network error|loading chunk|dynamically imported module|script error/i;

function isTransientMessage(raw: string): boolean {
  return TRANSIENT.test(String(raw || '').toLowerCase());
}

export function installProductionErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    const msg = String(event.message || '');
    if (isTransientMessage(msg)) {
      event.preventDefault();
      console.warn('[transient error]', msg.slice(0, 160));
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = String((reason as Error)?.message || reason || '');

    if (isTransientMessage(msg)) {
      event.preventDefault();
      console.warn('[transient rejection]', msg.slice(0, 160));
      return;
    }

    import('./monitoring')
      .then(({ captureError }) => captureError(reason))
      .catch(() => console.error('[unhandled rejection]', reason));
  });
}
