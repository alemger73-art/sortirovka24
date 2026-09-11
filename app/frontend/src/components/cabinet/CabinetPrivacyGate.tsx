import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import CabinetLockScreen from './CabinetLockScreen';
import { clearCabinetUnlock, loadSecuritySettings, shouldLockCabinet, type CabinetSecuritySettings } from '@/lib/cabinetPreferences';
import { getBiometricSupport } from '@/lib/biometricAuth';
import { useLanguage } from '@/contexts/LanguageContext';

/** Protect direct order links and role cabinets with the same device lock. */
export default function CabinetPrivacyGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const [checkedPath, setCheckedPath] = useState('');
  const [locked, setLocked] = useState(true);
  const [biometric, setBiometric] = useState(false);
  useEffect(() => {
    let alive = true;
    setBiometric(false);
    let settings: CabinetSecuritySettings | null = null;
    void loadSecuritySettings().then(async config => {
      if (!alive) return;
      settings = config;
      setLocked(shouldLockCabinet(config));
      setCheckedPath(pathname);
      if (config.biometricEnabled) {
        const support = await getBiometricSupport();
        if (alive) setBiometric(support.available);
      }
    });
    const visibility = () => {
      if (!settings?.lockEnabled) return;
      if (document.visibilityState === 'hidden') clearCabinetUnlock();
      setLocked(shouldLockCabinet(settings));
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { alive = false; document.removeEventListener('visibilitychange', visibility); };
  }, [pathname]);
  // The root cabinet owns its settings editor and updates lock state immediately.
  if (pathname === '/cabinet') return children;
  if (checkedPath !== pathname) return <p role="status" className="p-8">{t('cabinet.loading')}</p>;
  if (!locked) return children;
  return <CabinetLockScreen biometricAvailable={biometric} biometricLabel={t('cabinet.security.biometric')} onUnlocked={() => setLocked(false)} title={t('cabinet.security.lockTitle')} subtitle={t('cabinet.security.lockSubtitle')} pinLabel={t('cabinet.security.enterPin')} biometricButton={t('cabinet.security.useBiometric')} wrongPin={t('cabinet.security.wrongPin')} />;
}
