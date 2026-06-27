import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  SAFETY_DISMISS_DAYS,
  SAFETY_DISMISS_KEY,
  SAFETY_SESSION_TIP_KEY,
  isSafetyTipBarHidden,
  pickSafetyTipKey,
  type SafetyTipKey,
} from '@/lib/safetyTips';

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(SAFETY_DISMISS_KEY);
    if (!until) return false;
    return Date.now() < Number(until);
  } catch {
    return false;
  }
}

function getSessionTipKey(): SafetyTipKey {
  try {
    const stored = sessionStorage.getItem(SAFETY_SESSION_TIP_KEY);
    if (stored) return stored as SafetyTipKey;
  } catch {
    /* ignore */
  }
  const key = pickSafetyTipKey();
  try {
    sessionStorage.setItem(SAFETY_SESSION_TIP_KEY, key);
  } catch {
    /* ignore */
  }
  return key;
}

export function useSafetyTipBar() {
  const { pathname } = useLocation();
  const tipKey = useMemo(() => getSessionTipKey(), []);
  const [dismissed, setDismissed] = useState(() => isDismissed());

  const visible = !isSafetyTipBarHidden(pathname) && !dismissed;

  const dismiss = useCallback(() => {
    try {
      const until = Date.now() + SAFETY_DISMISS_DAYS * 86_400_000;
      localStorage.setItem(SAFETY_DISMISS_KEY, String(until));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  return { visible, tipKey, dismiss };
}

export type { SafetyTipKey };
