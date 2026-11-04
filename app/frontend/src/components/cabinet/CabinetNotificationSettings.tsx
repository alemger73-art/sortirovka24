import { useModules } from '@/hooks/useModules';
import { useTaxiEnabled } from '@/hooks/useTaxiEnabled';
import { ORDER_MODULE_KEYS } from '@/config/cabinetTabs';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { humanizeApiError } from '@/lib/apiErrors';
import { loadNotificationPrefs, saveNotificationPrefs, type CabinetNotificationPrefs } from '@/lib/cabinetPreferences';
import PushDeviceStatus from '@/components/cabinet/PushDeviceStatus';

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
  const { lang } = useLanguage();
  const text = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  const { isEnabled } = useModules();
  const taxi = useTaxiEnabled();
  const delivery = ORDER_MODULE_KEYS.some(isEnabled);
  const [notify, setNotify] = useState<CabinetNotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
        <PushDeviceStatus className="mb-3" />
        <p className="mb-2 text-xs text-gray-500">{text('Статусы заказов и доставки, такси и бонусы. Новости и реклама включаются отдельно ниже.', 'Тапсырыс пен жеткізу мәртебелері, такси және бонустар. Жаңалықтар мен жарнама төменде бөлек қосылады.')}</p>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-sky-700 dark:text-sky-300">{text('Настроить категории уведомлений', 'Хабарландыру санаттарын баптау')}</summary>
        <PrefRow label="Новости" checked={notify.news} onCheckedChange={v => void persistNotify({ ...notify, news: v })} />
        <PrefRow label="Реклама и предложения" hint="Только с вашего согласия" checked={notify.marketing} onCheckedChange={v => void persistNotify({ ...notify, marketing: v })} />

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
        </details>
      </section>
    </fieldset>;
}
