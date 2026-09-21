import { useModules } from '@/hooks/useModules';
import { useTaxiEnabled } from '@/hooks/useTaxiEnabled';
import { ORDER_MODULE_KEYS } from '@/config/cabinetTabs';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { humanizeApiError } from '@/lib/apiErrors';
import { loadNotificationPrefs, saveNotificationPrefs, type CabinetNotificationPrefs } from '@/lib/cabinetPreferences';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionState,
  type PushPermissionState,
} from '@/lib/pushNotifications';

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
  const { isEnabled } = useModules();
  const taxi = useTaxiEnabled();
  const delivery = ORDER_MODULE_KEYS.some(isEnabled);
  const [notify, setNotify] = useState<CabinetNotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<PushPermissionState>('disabled');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => { void loadNotificationPrefs().then(setNotify); }, []);
  useEffect(() => { void getPushPermissionState().then(setPermission).catch(() => setPermission('unsupported')); }, []);
  async function changePush(enabled: boolean) {
    if (pushBusy) return;
    setPushBusy(true);
    setError('');
    try {
      setPermission(enabled ? await enablePushNotifications() : await disablePushNotifications());
    } catch (e) {
      setError(humanizeApiError(e));
      setPermission(await getPushPermissionState().catch((): PushPermissionState => 'unsupported'));
    } finally {
      setPushBusy(false);
    }
  }
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
        {permission === 'enabled' ? (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Push-уведомления включены</span>
            <button type="button" disabled={pushBusy} className="text-xs font-semibold text-gray-600 underline dark:text-slate-300" onClick={() => void changePush(false)}>Отключить на этом устройстве</button>
          </div>
        ) : permission === 'disabled' ? (
          <button type="button" disabled={pushBusy} className="mb-3 rounded-xl bg-sky-100 px-4 py-3 text-sm font-semibold text-sky-800 disabled:opacity-60" onClick={() => void changePush(true)}>
            {pushBusy ? 'Подключаем…' : t('cabinet.enableNotifications')}
          </button>
        ) : null}
        {permission === 'denied' && <p className="mb-3 text-xs">Уведомления заблокированы в настройках браузера или телефона. Разрешите их для Sortirovka 24 и вернитесь на эту страницу.</p>}
        {permission === 'needs-install' && <p className="mb-3 text-xs">На iPhone сначала установите Sortirovka 24 на экран «Домой» через кнопку «Поделиться», затем откройте установленное приложение и включите уведомления здесь.</p>}
        {permission === 'unsupported' && <p className="mb-3 text-xs">Это устройство или браузер не поддерживает push-уведомления.</p>}
        <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{t('cabinet.permissions.hint')}</p>

        {delivery && <PrefRow
          label={t('cabinet.permissions.orders')}
          checked={notify.orders}
          onCheckedChange={(v) => void persistNotify({ ...notify, orders: v })}
        />}
        {delivery && <PrefRow
          label={t('cabinet.permissions.delivery')}
          checked={notify.delivery}
          onCheckedChange={(v) => void persistNotify({ ...notify, delivery: v })}
        />}
        {taxi === true && <PrefRow
          label={t('cabinet.permissions.taxi')}
          checked={notify.taxi}
          onCheckedChange={(v) => void persistNotify({ ...notify, taxi: v })}
        />}
        <PrefRow
          label={t('cabinet.permissions.bonuses')}
          checked={notify.bonuses}
          onCheckedChange={(v) => void persistNotify({ ...notify, bonuses: v })}
        />
        {isEnabled('masters') && <PrefRow
          label={t('cabinet.permissions.master')}
          checked={notify.master}
          onCheckedChange={(v) => void persistNotify({ ...notify, master: v })}
        />}
      </section>
    </fieldset>;
}
