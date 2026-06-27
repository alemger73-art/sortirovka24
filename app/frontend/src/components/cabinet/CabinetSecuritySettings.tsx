import { useEffect, useState } from 'react';
import { Bell, Fingerprint, Lock, Shield, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  clearCabinetPin,
  loadNotificationPrefs,
  loadSecuritySettings,
  saveNotificationPrefs,
  saveSecuritySettings,
  setCabinetPin,
  type CabinetNotificationPrefs,
  type CabinetSecuritySettings,
} from '@/lib/cabinetPreferences';
import { getBiometricSupport, type BiometricSupport } from '@/lib/biometricAuth';

interface Props {
  t: (key: string) => string;
  onSettingsChange?: (settings: CabinetSecuritySettings) => void;
}

function PrefRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export default function CabinetSecuritySettings({ t, onSettingsChange }: Props) {
  const [security, setSecurity] = useState<CabinetSecuritySettings | null>(null);
  const [notify, setNotify] = useState<CabinetNotificationPrefs | null>(null);
  const [bio, setBio] = useState<BiometricSupport | null>(null);
  const [pinSetup, setPinSetup] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [sec, prefs, support] = await Promise.all([
        loadSecuritySettings(),
        loadNotificationPrefs(),
        getBiometricSupport(),
      ]);
      setSecurity(sec);
      setNotify(prefs);
      setBio(support);
    })();
  }, []);

  async function persistSecurity(next: CabinetSecuritySettings) {
    setSecurity(next);
    await saveSecuritySettings(next);
    onSettingsChange?.(next);
  }

  async function persistNotify(next: CabinetNotificationPrefs) {
    setNotify(next);
    await saveNotificationPrefs(next);
  }

  async function savePin() {
    setPinError('');
    if (!/^\d{4,6}$/.test(pinSetup)) {
      setPinError(t('cabinet.security.pinInvalid'));
      return;
    }
    if (pinSetup !== pinConfirm) {
      setPinError(t('cabinet.security.pinMismatch'));
      return;
    }
    setSaving(true);
    try {
      const next = await setCabinetPin(pinSetup);
      setSecurity(next);
      onSettingsChange?.(next);
      setPinSetup('');
      setPinConfirm('');
    } finally {
      setSaving(false);
    }
  }

  async function removePin() {
    if (!window.confirm(t('cabinet.security.removePinConfirm'))) return;
    const next = await clearCabinetPin();
    setSecurity(next);
    onSettingsChange?.(next);
  }

  if (!security || !notify) {
    return <p className="text-sm text-gray-400">{t('cabinet.loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#2a3347] dark:bg-[#0f172a]">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('cabinet.security.title')}</h3>
        </div>
        <p className="mb-4 text-xs text-gray-500 dark:text-slate-400">{t('cabinet.security.hint')}</p>

        <PrefRow
          label={t('cabinet.security.lockEnabled')}
          hint={t('cabinet.security.lockEnabledHint')}
          checked={security.lockEnabled}
          disabled={!security.pinEnabled}
          onCheckedChange={(v) => void persistSecurity({ ...security, lockEnabled: v })}
        />

        <div className="border-t border-gray-200 pt-4 dark:border-[#26324a]">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-500" />
            <p className="text-sm font-semibold">{t('cabinet.security.pinTitle')}</p>
          </div>
          {security.pinEnabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-500/20 dark:text-green-200">
                {t('cabinet.security.pinSet')}
              </span>
              <button
                type="button"
                onClick={() => void removePin()}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('cabinet.security.removePin')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                value={pinSetup}
                onChange={(e) => setPinSetup(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-[#2a3347] dark:bg-[#111827]"
                placeholder={t('cabinet.security.pinPlaceholder')}
              />
              <input
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-[#2a3347] dark:bg-[#111827]"
                placeholder={t('cabinet.security.pinConfirmPlaceholder')}
              />
              {pinError ? <p className="text-xs text-red-600">{pinError}</p> : null}
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePin()}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {t('cabinet.security.savePin')}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-[#26324a]">
          <PrefRow
            label={bio?.label || t('cabinet.security.biometric')}
            hint={
              bio?.available
                ? t('cabinet.security.biometricHint')
                : t('cabinet.security.biometricUnavailable')
            }
            checked={security.biometricEnabled}
            disabled={!security.pinEnabled || !bio?.available}
            onCheckedChange={(v) => void persistSecurity({ ...security, biometricEnabled: v, lockEnabled: v ? true : security.lockEnabled })}
          />
          {bio?.available ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Fingerprint className="h-3.5 w-3.5" />
              {t('cabinet.security.biometricReady')}
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#2a3347] dark:bg-[#0f172a]">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-5 w-5 text-sky-600" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('cabinet.permissions.title')}</h3>
        </div>
        <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{t('cabinet.permissions.hint')}</p>

        <PrefRow
          label={t('cabinet.permissions.orders')}
          checked={notify.orders}
          onCheckedChange={(v) => void persistNotify({ ...notify, orders: v })}
        />
        <PrefRow
          label={t('cabinet.permissions.delivery')}
          checked={notify.delivery}
          onCheckedChange={(v) => void persistNotify({ ...notify, delivery: v })}
        />
        <PrefRow
          label={t('cabinet.permissions.taxi')}
          checked={notify.taxi}
          onCheckedChange={(v) => void persistNotify({ ...notify, taxi: v })}
        />
        <PrefRow
          label={t('cabinet.permissions.bonuses')}
          checked={notify.bonuses}
          onCheckedChange={(v) => void persistNotify({ ...notify, bonuses: v })}
        />
        <PrefRow
          label={t('cabinet.permissions.master')}
          checked={notify.master}
          onCheckedChange={(v) => void persistNotify({ ...notify, master: v })}
        />
      </section>
    </div>
  );
}
