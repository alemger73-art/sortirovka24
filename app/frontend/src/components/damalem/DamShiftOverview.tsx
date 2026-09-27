import type {ProcurementView} from './ShiftCloseDialog';
import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodBusiness, foodShifts } from '@/lib/foodOperations';
import { useLanguage } from '@/contexts/LanguageContext';
import { staffName, type OwnerOverview } from '@/pages/DamOwnerDashboard';
import { Input } from '@/components/ui/input';
import type { DamShift } from './DamShiftPanel';

interface StaffAction { details?:string; staff_id:string; staff_type:string; id: number; shift_id: number | null; staff_name: string; role: string; action: string; entity_type?: string; entity_id?: string; created_at: string }

function actionDetail(value?:string) {
  try {
    const data=JSON.parse(value||'{}');
    const status:Record<string,string>={new:'новый',confirmed:'принят',preparing:'готовится',ready:'готов',in_progress:'в доставке',done:'завершён',cancelled:'отменён'};
    return [data.status?`Статус: ${status[data.status]||data.status}`:'',data.payment_status?`Оплата: ${data.payment_status==='paid'?'получена':'ожидается'}`:'',data.courier_name?`Курьер: ${data.courier_name}`:'',data.amount?`Сумма: ${data.amount} ₸`:'',data.reason?`Причина: ${data.reason}`:'',data.resolution?`Решение: ${data.resolution}`:'',data.comment||''].filter(Boolean).join(' · ');
  } catch {return '';}
}

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
const courierAction:Record<string,string>={courier_pin_login:'Вход курьера',cash_collected:'Получены наличные от клиента',earning:'Начислено за доставку',cash_handover_requested:'Запрошена передача наличных',cash_handed_over:'Приняты наличные курьера',cash_adjustment:'Корректировка наличных',courier_payout_paid:'Выплачено вознаграждение',courier_reassigned:'Курьер переназначен',delivery_issue_created:'Сообщена проблема доставки',delivery_issue_resolved:'Проблема доставки решена'};
function duration(seconds?: number | null) { if (seconds == null) return ''; const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return `${h} ч ${m} мин`; }

export default function DamShiftOverview() {
  const { t } = useLanguage();
  const [shifts, setShifts] = useState<DamShift[]>([]);
  const [procurement,setProcurement]=useState<ProcurementView|null>(null);

  const [actions, setActions] = useState<StaffAction[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(()=>{let alive=true;setProcurement(null);if(selected)void foodShifts<{report:ProcurementView|null}>(`/${selected}/procurement`).then(v=>{if(alive)setProcurement(v.report);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[selected]);
  const [history, setHistory] = useState(false);
  const [team,setTeam]=useState<OwnerOverview['team']>([]);
  const [error, setError] = useState('');
  const [filters,setFilters]=useState({start:'',end:'',staff_id:'',action:'',order_id:''});
  const load = useCallback(async () => {
    try {
      setTeam((await foodBusiness<OwnerOverview>('/overview')).team);
      const result = await foodShifts<{items: DamShift[]}>(history ? '/history?limit=100' : '/today');
      setShifts(result.items);
      const chosen = selected && result.items.some(item => item.id === selected) ? selected : null;
      setSelected(chosen);
      const query=new URLSearchParams(); Object.entries(filters).forEach(([key,value])=>{if(value&&key!=='staff_id')query.set(key,value);});if(filters.staff_id){const [kind,...id]=filters.staff_id.split(':');query.set('staff_type',kind);query.set('staff_id',id.join(':'));}if(chosen)query.set('shift_id',String(chosen));
      setActions((await foodShifts<{items: StaffAction[]}>(`/actions?${query}`)).items);
      if(chosen)setProcurement((await foodShifts<{report:ProcurementView|null}>(`/${chosen}/procurement`)).report);
      setError('');
    } catch (e) { setError((e as Error).message); }
  }, [history, selected, filters]);
  useEffect(() => { void load(); const id=window.setInterval(()=>{if(!document.hidden)void load();},15000);return()=>clearInterval(id); }, [load]);
  const active = shifts.filter(s => s.active);
  return <section className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5" />{history?t('dam.shift.history'):t('dam.shift.today')}</h3><p className="text-sm text-muted-foreground">{history?t('dam.shift.historyHelp'):t('dam.shift.todayHelp')}</p></div><div className="flex flex-wrap gap-2"><Button variant={history?'outline':'default'} size="sm" onClick={()=>{setSelected(null);setHistory(false);}}>{t('dam.shift.showToday')}</Button><Button variant={history?'default':'outline'} size="sm" onClick={()=>{setSelected(null);setHistory(true);}}>{t('dam.shift.showHistory')}</Button><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />{t('dam.shift.refresh')}</Button></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
    <div className="rounded-xl bg-muted/60 p-3 text-sm"><strong>{t('dam.shift.workingNow')}: {active.length}</strong>{active.length > 0 && <span className="ml-2 text-muted-foreground">{active.map(s => s.staff_name).join(', ')}</span>}</div>
    {!shifts.length ? <p className="text-sm text-muted-foreground">{t('dam.shift.empty')}</p> : <div className="grid gap-2 md:grid-cols-2">{shifts.map(s => <button key={s.id} onClick={() => setSelected(s.id)} className={`rounded-xl border p-3 text-left transition ${selected === s.id ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : 'hover:bg-muted'}`}><div className="flex items-center justify-between gap-2"><strong>{s.staff_name}</strong><span className="text-xs text-muted-foreground">{s.role==='operator'?'Оператор':s.role==='courier'?'Курьер':'Владелец'}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{s.active ? t('dam.shift.active') : t('dam.shift.finished')}</span></div><p className="mt-1 text-xs text-muted-foreground">{new Date(s.opened_at).toLocaleString('ru-KZ', {timeZone:'Asia/Almaty'})} {s.closed_at ? `→ ${new Date(s.closed_at).toLocaleTimeString([], {timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'})}` : ''} {s.duration_seconds != null ? `· ${duration(s.duration_seconds)}` : ''}</p></button>)}</div>}
    {selected && <div className="rounded-xl border p-4 space-y-2"><h4 className="font-bold">Закуп</h4>{procurement?<><p>{procurement.staff_name} · Смена №{procurement.shift_id}</p>{procurement.not_required?<p>Закуп не требуется. Причина: {procurement.reason}</p>:<ul className="space-y-2">{procurement.items.map((i,n)=><li key={n}>{i.name} — {i.quantity} {i.unit}{i.comment?` · ${i.comment}`:''}</li>)}</ul>}{procurement.comment&&<p>{procurement.comment}</p>}<p className="text-sm">Telegram: {({pending:'В очереди',sending:'Отправляется',sent:'Отправлено',failed:'Ошибка, требуется проверка',unknown:'Результат неизвестен — проверьте канал'} as Record<string,string>)[procurement.telegram_status]||procurement.telegram_status}</p>{procurement.telegram_error&&<p className="text-sm text-destructive">{procurement.telegram_error}</p>}</>:<p className="text-sm text-muted-foreground">Для этой смены закупной отчёт пока не сохранён.</p>}</div>}
    {<div><h4 className="mb-2 flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" />{t('dam.shift.actions')}</h4><div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs">С даты<Input type="date" value={filters.start} onChange={e=>setFilters({...filters,start:e.target.value})}/></label><label className="text-xs">По дату<Input type="date" value={filters.end} onChange={e=>setFilters({...filters,end:e.target.value})}/></label><label className="text-xs">Сотрудник<select className="block h-10 w-full rounded-md border bg-background px-2" value={filters.staff_id} onChange={e=>{setSelected(null);setFilters({...filters,staff_id:e.target.value});}}><option value="">Все сотрудники</option>{team.map(p=><option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>{staffName(p.name,p.login)}</option>)}</select></label><label className="text-xs">Действие<select className="block h-10 w-full rounded-md border bg-background px-2" value={filters.action} onChange={e=>setFilters({...filters,action:e.target.value})}><option value="">Все действия</option><option value="business_settings_changed">Меню и настройки</option><option value="courier_assigned">Назначение курьера</option>{Object.entries(courierAction).map(([key,label])=><option key={key} value={key}>{label}</option>)}{Object.entries(actionKey).map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</select></label><label className="text-xs">Заказ №<Input inputMode="numeric" value={filters.order_id} onChange={e=>setFilters({...filters,order_id:e.target.value.replace(/\D/g,'')})}/></label></div>{selected&&<Button size="sm" variant="outline" className="mb-3" onClick={()=>setSelected(null)}>Показать действия вне выбранной смены</Button>}{!actions.length ? <p className="text-sm text-muted-foreground">{t('dam.shift.noActions')}</p> : <div className="max-h-64 space-y-2 overflow-y-auto">{actions.map(a => <div key={a.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span><strong>{a.staff_name}</strong> · {a.action==='courier_assigned'?'Назначен курьер':a.action==='business_settings_changed'?'изменил меню или настройки':(courierAction[a.action] || t(actionKey[a.action] || 'dam.shift.actionOther'))}{a.entity_id ? ` №${a.entity_id}` : ''}<small className="block text-muted-foreground">{actionDetail(a.details)}</small></span><time className="shrink-0 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('ru-KZ', {timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'})}</time></div>)}</div>}</div>}
  </section>;
}
