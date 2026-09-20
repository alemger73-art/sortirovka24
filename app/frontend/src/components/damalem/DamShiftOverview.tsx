import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodShifts } from '@/lib/foodOperations';
import { useLanguage } from '@/contexts/LanguageContext';
import type { DamShift } from './DamShiftPanel';
import { formatDamDateTime, formatDamTime } from '@/lib/damTime';

interface StaffAction { id: number; shift_id: number | null; staff_name: string; role: string; action: string; entity_type?: string; entity_id?: string; created_at: string }

const actionKey: Record<string, string> = {
  shift_opened: 'dam.shift.actionOpened', shift_closed: 'dam.shift.actionClosed',
  order_created: 'dam.shift.actionOrderCreated', order_updated: 'dam.shift.actionOrderUpdated',
  order_receipt_changed: 'dam.shift.actionReceiptChanged', product_availability_changed: 'dam.shift.actionAvailability',
  delivery_accepted: 'dam.shift.actionDeliveryAccepted', delivery_declined: 'dam.shift.actionDeliveryDeclined',
  delivery_status_changed: 'dam.shift.actionDeliveryStatus', courier_online_changed: 'dam.shift.actionCourierOnline',
  notification_retried: 'dam.shift.actionNotificationRetried', expense_recorded: 'dam.shift.actionExpenseRecorded',
  expense_voided: 'dam.shift.actionExpenseVoided', refund_recorded: 'dam.shift.actionRefundRecorded',
  payroll_employee_created: 'dam.shift.actionEmployeeCreated', payroll_employee_updated: 'dam.shift.actionEmployeeUpdated',
  sales_department_changed: 'dam.shift.actionDepartmentChanged', payroll_work_changed: 'dam.shift.actionWorkChanged',
  payroll_day_closed: 'dam.shift.actionDayClosed', payroll_day_reopened: 'dam.shift.actionDayReopened',
  salary_payment_recorded: 'dam.shift.actionSalaryPaid', staff_created: 'dam.shift.actionStaffCreated',
  staff_updated: 'dam.shift.actionStaffUpdated', staff_deleted: 'dam.shift.actionStaffDeleted',
  courier_pin_changed: 'dam.shift.actionCourierPinChanged',
};
function duration(seconds?: number | null) { if (seconds == null) return ''; const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return `${h} ч ${m} мин`; }

export default function DamShiftOverview() {
  const { t } = useLanguage();
  const [shifts, setShifts] = useState<DamShift[]>([]);
  const [actions, setActions] = useState<StaffAction[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await foodShifts<{items: DamShift[]}>(history ? '/history?limit=100' : '/today');
      setShifts(result.items);
      const chosen = selected && result.items.some(item => item.id === selected) ? selected : result.items[0]?.id ?? null;
      setSelected(chosen);
      setActions(chosen ? (await foodShifts<{items: StaffAction[]}>(`/actions?shift_id=${chosen}`)).items : []);
      setError('');
    } catch (e) { setError((e as Error).message); }
  }, [history, selected]);
  useEffect(() => { void load(); }, [load]);
  const active = shifts.filter(s => s.active);
  return <section className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5" />{history?t('dam.shift.history'):t('dam.shift.today')}</h3><p className="text-sm text-muted-foreground">{history?t('dam.shift.historyHelp'):t('dam.shift.todayHelp')}</p></div><div className="flex flex-wrap gap-2"><Button variant={history?'outline':'default'} size="sm" onClick={()=>{setSelected(null);setHistory(false);}}>{t('dam.shift.showToday')}</Button><Button variant={history?'default':'outline'} size="sm" onClick={()=>{setSelected(null);setHistory(true);}}>{t('dam.shift.showHistory')}</Button><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />{t('dam.shift.refresh')}</Button></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
    <div className="rounded-xl bg-muted/60 p-3 text-sm"><strong>{t('dam.shift.workingNow')}: {active.length}</strong>{active.length > 0 && <span className="ml-2 text-muted-foreground">{active.map(s => s.staff_name).join(', ')}</span>}</div>
    {!shifts.length ? <p className="text-sm text-muted-foreground">{t('dam.shift.empty')}</p> : <div className="grid gap-2 md:grid-cols-2">{shifts.map(s => <button key={s.id} onClick={() => setSelected(s.id)} className={`rounded-xl border p-3 text-left transition ${selected === s.id ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : 'hover:bg-muted'}`}><div className="flex items-center justify-between gap-2"><strong>{s.staff_name}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{s.active ? t('dam.shift.active') : t('dam.shift.finished')}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDamDateTime(s.opened_at)} {s.closed_at ? `→ ${formatDamTime(s.closed_at)}` : ''} {s.duration_seconds != null ? `· ${duration(s.duration_seconds)}` : ''}</p></button>)}</div>}
    {selected && <div><h4 className="mb-2 flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" />{t('dam.shift.actions')}</h4>{!actions.length ? <p className="text-sm text-muted-foreground">{t('dam.shift.noActions')}</p> : <div className="max-h-64 space-y-2 overflow-y-auto">{actions.map(a => <div key={a.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span><strong>{a.staff_name}</strong> · {t(actionKey[a.action] || 'dam.shift.actionOther')}{a.entity_id ? ` №${a.entity_id}` : ''}</span><time className="shrink-0 text-xs text-muted-foreground">{formatDamTime(a.created_at)}</time></div>)}</div>}</div>}
  </section>;
}
