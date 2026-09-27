import { useCallback, useEffect, useRef, useState } from 'react';
import { foodBusiness } from '@/lib/foodOperations';
import { Button } from '@/components/ui/button';

export interface TeamMember {
  id: string; type: string; name: string; login: string; role: string; active: boolean;
  shift: { opened_at: string } | null;
  last_action: { action: string; at: string; entity_id: string | null } | null;
  deliveries: number[];
}
export interface OwnerOverview {
  team: TeamMember[];
  attention: { key: string; text: string; section: string; order_id?: number }[];
  attention_total: number;
  recent_orders: { id: number; name: string; status: string; amount: number; source: string; delivery_method: string }[];
}
export const staffName = (name: string, login: string) => /^(dam\s*alem|d[äa]m\s*[äa]lem|дам\s*алем)(\s*2\.0)?$/i.test((name || '').trim()) ? login : name || login;
export const roleName = (role: string) => ({owner: 'Владелец', operator: 'Оператор', courier: 'Курьер'}[role] || role);
export const clockTime = (at: string) => new Date(at).toLocaleTimeString('ru-KZ', {timeZone:'Asia/Almaty', hour:'2-digit', minute:'2-digit'});
const money = (value: number) => `${Number(value || 0).toLocaleString('ru-KZ', {maximumFractionDigits:2})} ₸`;
const labels: Record<string, string> = {new:'Новые', confirmed:'Приняты', preparing:'Готовятся', ready:'Готовы к выдаче', in_progress:'В доставке', done:'Завершён', cancelled:'Отменён'};
const sources: Record<string, string> = {app:'Приложение', operator:'Оператор', whatsapp:'WhatsApp', instagram:'Instagram'};
interface Summary {day:string; counts:Record<string, number>; daily:{created:number}; notification_errors:number}
interface Finance {sales:number; completed:number; average:number; receipts:number; expenses_total:number; refunds:number; cash_difference:number; refunds_needed:{id:number; amount:number}[]}

export default function DamOwnerDashboard({navigate}:{navigate:(section:string, order?:number, status?:string)=>void}) {
  const [data, setData] = useState<{summary:Summary; finance:Finance; overview:OwnerOverview; stopped:number}|null>(null);
  const [error, setError] = useState('');
  const running = useRef(false);
  const load = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const summary = await foodBusiness<Summary>('/today');
      const [finance, overview, items] = await Promise.all([
        foodBusiness<Finance>(`/report?start=${summary.day}&end=${summary.day}`),
        foodBusiness<OwnerOverview>('/overview'),
        foodBusiness<{available:boolean}[]>('/availability'),
      ]);
      setData({summary, finance, overview, stopped:items.filter(i=>!i.available).length}); setError('');
    } catch(e) {setError((e as Error).message);} finally {running.current=false;}
  }, []);
  useEffect(()=>{void load(); const id=window.setInterval(()=>{if(!document.hidden) void load();},15000); return ()=>clearInterval(id);},[load]);
  if (!data) return <div role={error?'alert':'status'} className="rounded-2xl border bg-card p-6">{error || 'Загружаем показатели…'}{error && <Button variant="outline" onClick={()=>void load()}>Повторить</Button>}</div>;
  const {summary,finance,overview,stopped}=data;
  const attention = [
    ...finance.refunds_needed.slice(0,3).map(r=>({key:`refund:${r.id}`,text:`Заказ №${r.id}: требуется возврат ${money(r.amount)}`,section:'sales',order_id:undefined})),
    ...overview.attention,
    ...(stopped ? [{key:'stopped',text:`В стоп-листе: ${stopped}`,section:'availability',order_id:undefined}] : []),
    ...(summary.notification_errors ? [{key:'notifications',text:`Ошибки уведомлений: ${summary.notification_errors}`,section:'orders',order_id:undefined}] : []),
  ];
  const working=overview.team.filter(p=>p.shift && p.active);
  const stats=[['Выручка сегодня',money(finance.sales),'Завершённые заказы'],['Заказов сегодня',summary.daily.created,'Созданы сегодня'],['Средний чек',money(finance.average),`Завершено: ${finance.completed}`],['Получено денег',money(finance.receipts),'По дате поступления'],['Расходы',money(finance.expenses_total),'Учтённые расходы'],['Возвраты',money(finance.refunds),'По дате возврата'],['Результат дня',money(finance.cash_difference),'Поступления − возвраты − расходы']];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-semibold">Сегодня, {new Date(summary.day+'T12:00:00Z').toLocaleDateString('ru-KZ',{day:'numeric',month:'long'})}</h3><p className="text-sm text-muted-foreground">Показатели по времени Караганды · обновление каждые 15 секунд</p></div><Button variant="outline" onClick={()=>void load()}>Обновить</Button></div>
    {error && <p role="alert" className="rounded-xl border border-amber-300 p-3 text-sm">Не удалось обновить: {error}. Показаны последние полученные данные.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([label,value,hint])=><section key={label} className="min-w-0 rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-2 block break-words text-2xl tracking-tight">{value}</strong><p className="mt-2 text-xs text-muted-foreground">{hint}</p></section>)}<button className="rounded-2xl border bg-muted/40 p-4 text-left text-sm font-medium hover:bg-muted" onClick={()=>navigate('sales')}>Финансы за другой период →<span className="mt-2 block text-xs font-normal text-muted-foreground">Результат дня — движение денег, не бухгалтерская прибыль.</span></button></div>
    <section className="rounded-2xl border bg-card p-4"><h3 className="mb-3 font-semibold">Заказы сейчас</h3><div className="grid grid-cols-2 gap-2 md:grid-cols-5">{['new','confirmed','preparing','ready','in_progress'].map(status=><button key={status} onClick={()=>navigate('orders',undefined,status==='ready'?'ready_all':status)} className="rounded-xl bg-muted/50 p-3 text-left hover:bg-muted"><span className="text-sm text-muted-foreground">{labels[status]}</span><strong className="mt-1 block text-2xl">{summary.counts[status]||0}</strong></button>)}</div></section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-5"><h3 className="font-semibold">Требует внимания</h3>{!attention.length ? <p className="mt-3 text-sm text-emerald-700">Все работает штатно</p> : <div className="mt-3 divide-y">{attention.slice(0,6).map(a=><button key={a.key} className="block w-full py-3 text-left text-sm hover:text-primary" onClick={()=>navigate(a.section,a.order_id)}>{a.text} →</button>)}{attention.length>6 && <p className="pt-3 text-xs text-muted-foreground">Ещё {attention.length-6} событий. Откройте заказы и финансы для проверки.</p>}</div>}</section>
      <section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Команда сейчас</h3><Button size="sm" variant="ghost" onClick={()=>navigate('staff')}>Вся команда →</Button></div>{!working.length && <p className="mt-3 text-sm text-muted-foreground">Нет сотрудников на смене</p>}<div className="mt-2 divide-y">{working.slice(0,5).map(p=><div key={`${p.type}:${p.id}`} className="py-3"><strong className="text-sm">{staffName(p.name,p.login)}</strong><p className="text-sm text-muted-foreground">{roleName(p.role)} · на смене с {clockTime(p.shift!.opened_at)}</p>{p.deliveries.length>0 && <p className="text-xs">Назначены доставки: {p.deliveries.map(id=>`№${id}`).join(', ')}</p>}</div>)}</div></section>
    </div>
    <section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Последние заказы</h3><Button variant="outline" size="sm" onClick={()=>navigate('orders')}>Все заказы →</Button></div>{!overview.recent_orders.length && <p className="mt-4 text-sm text-muted-foreground">Заказов пока нет</p>}<div className="mt-3 divide-y">{overview.recent_orders.map(o=><button key={o.id} onClick={()=>navigate('orders',o.id)} className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left"><span><strong className="text-sm">№{o.id} · {o.name || 'Клиент'}</strong><span className="block text-xs text-muted-foreground">{sources[o.source]||o.source} · {labels[o.status]||o.status}</span></span><strong className="text-sm">{money(o.amount)} →</strong></button>)}</div></section>
  </div>;
}
