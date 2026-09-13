import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { humanizeApiError } from '@/lib/apiErrors';
import { loadNotificationPrefs, saveNotificationPrefs, type CabinetNotificationPrefs } from '@/lib/cabinetPreferences';

interface Props { t: (key: string) => string }
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
      <Switch aria-label={label} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export default function CabinetNotificationSettings({ t }: Props) {
  const [notify, setNotify] = useState<CabinetNotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  useEffect(() => { void loadNotificationPrefs().then(setNotify); }, []);
  async function persistNotify(next: CabinetNotificationPrefs) {
    if (saving) return;
    setSaving(true);
    setError('');
    try { await saveNotificationPrefs(next); setNotify(next); }
    catch (e) { setError(humanizeApiError(e)); }
    finally { setSaving(false); }
  }
  if (!notify) return <p role="status">{t('cabinet.loading')}</p>;
  return <fieldset disabled={saving} className="min-w-0 space-y-6">
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#2a3347] dark:bg-[#0f172a]">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-5 w-5 text-sky-600" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('cabinet.permissions.title')}</h3>
        </div>
        {permission === 'default' && <button type="button" className="mb-3 rounded-xl bg-sky-100 px-4 py-3 text-sm font-semibold text-sky-800" onClick={() => { void Notification.requestPermission().then(setPermission); }}>{t('cabinet.enableNotifications')}</button>}
        {permission === 'denied' && <p className="mb-3 text-xs">{t('cabinet.notificationsDenied')}</p>}
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
    </fieldset>;
}
