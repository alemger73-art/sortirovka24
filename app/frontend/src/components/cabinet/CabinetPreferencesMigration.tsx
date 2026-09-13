import { useEffect, type ReactNode } from 'react';
import { retireCabinetDeviceLock } from '@/lib/cabinetPreferences';

/** Runs after account authentication; obsolete PIN settings never gate the UI. */
export default function CabinetPreferencesMigration({ children }: { children: ReactNode }) {
  useEffect(() => { void retireCabinetDeviceLock(); }, []);
  return <>{children}</>;
}
