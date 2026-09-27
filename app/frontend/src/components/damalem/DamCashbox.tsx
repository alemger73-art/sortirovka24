import {useCallback, useEffect, useRef, useState} from 'react';
import {foodOperations} from '@/lib/foodOperations';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

type Entry = {id:string; label:string; amount:number; recipient:string; reason:string; actor:string; created_at:string; order_id:number|null};
type Cashbox = {configured:boolean; balance:number|null; entries:Entry[]};
const cashApi = <T,>(path='', method='GET', body?:unknown) => foodOperations<T>(path,method,body,'cashbox');
const money = (n:number) => `${n.toLocaleString('ru-KZ',{maximumFractionDigits:2})} ₸`;
const categories:Record<string,string> = {products:'Закуп продуктов',packaging:'Упаковка',couriers:'Курьеры',salary:'Зарплата',rent:'Аренда',other:'Прочее'};
const blank = () => ({id:crypto.randomUUID(),kind:'expense',amount:'',recipient:'',reason:'',category:'products'});

export default function DamCashbox({owner,canWrite}:{owner:boolean;canWrite:boolean}) {
  const [data,setData]=useState<Cashbox|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [form,setForm]=useState(blank),[busy,setBusy]=useState(false);
  const lock=useRef(false),generation=useRef(0);
  const load=useCallback(async()=>{const gen=++generation.current;try{const next=await cashApi<Cashbox>();if(gen===generation.current){setData(next);setError('');}}catch(e){if(gen===generation.current)setError((e as Error).message);}},[]);
  useEffect(()=>{void load();const refresh=()=>{if(!document.hidden&&!lock.current)void load();};const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);generation.current++;};},[load]);
  const kind=data?.configured?form.kind:'opening';
  const amount=Number(form.amount.replace(',','.'));
  const valid=form.amount.trim()!==''&&Number.isFinite(amount)&&(kind==='correction'?amount!==0:kind==='opening'?amount>=0:amount>0)&&form.reason.trim()&&(kind==='opening'||kind==='correction'||form.recipient.trim());
  async function save(){if(lock.current||!valid)return;
    if(!window.confirm(`${kind==='opening'?'Зафиксировать начальный остаток':kind==='correction'?'Записать разницу пересчёта':'Записать движение наличных'}: ${money(amount)}?${form.recipient?`\n${form.recipient}`:''}\n${form.reason}`))return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{await cashApi('/entries','POST',{...form,kind,amount:form.amount.replace(',','.')});setForm(blank());setNotice('Операция сохранена в общей кассе');await load();}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  return <section className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold">Общая касса</h3><p className="mt-1 text-sm text-muted-foreground">Наличные DÄM ALEM для всех операторов. Kaspi и Halyk учитываются отдельно в финансах.</p></div><Button variant="outline" disabled={busy} onClick={()=>void load()}>Обновить кассу</Button></div>
    {error&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    {notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {!data&&!error&&<p role="status">Загружаем кассу…</p>}
    {data&&<><div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Учётный остаток наличных сейчас</p><p className="mt-2 break-words text-3xl font-bold" data-testid="cashbox-balance">{data.configured?money(data.balance??0):'Остаток не задан'}</p><p className="mt-3 text-sm text-muted-foreground">Оплаты наличными на месте и подтверждённые передачи курьеров увеличивают остаток. Деньги у курьера ещё не находятся в кассе.</p>{data.configured&&(data.balance??0)<0&&<p role="alert" className="mt-3 text-red-700">Отрицательный остаток: пересчитайте наличные и проверьте поступления и возвраты.</p>}</div>
      {(!data.configured&&!owner)?<p className="rounded-xl border p-4">Владелец должен пересчитать наличные и один раз указать начальный остаток.</p>:<div className="rounded-2xl border bg-card p-4"><h4 className="font-semibold">{data.configured?'Движение наличных':'Начальный остаток'}</h4>{!canWrite&&<p className="mt-2 text-sm text-amber-700">Для операций с кассой откройте свою смену.</p>}
        <fieldset disabled={busy||!canWrite} className="mt-4 grid gap-4 sm:grid-cols-2">
          {data.configured&&<label className="text-sm">Операция<select aria-label="Операция кассы" className="mt-1 h-11 w-full rounded-md border bg-background px-2" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="expense">Расход из кассы</option><option value="withdrawal">Выдать без нового расхода</option><option value="deposit">Внести деньги</option>{owner&&<option value="correction">Разница по пересчёту</option>}</select></label>}
          <label className="text-sm">{kind==='correction'?'Разница: плюс или минус, ₸':'Сумма, ₸'}<Input aria-label="Сумма наличных" inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
          {kind==='expense'&&<label className="text-sm">Категория расхода<select className="mt-1 h-11 w-full rounded-md border bg-background px-2" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{Object.entries(categories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
          {!['opening','correction'].includes(kind)&&<label className="text-sm">{kind==='deposit'?'От кого получены деньги':'Кто взял деньги'}<Input aria-label="Получатель или вноситель" maxLength={200} value={form.recipient} onChange={e=>setForm({...form,recipient:e.target.value})}/></label>}
          <label className="text-sm sm:col-span-2">{kind==='opening'?'Комментарий к пересчёту':'Для чего / основание'}<Input aria-label="Назначение наличных" maxLength={800} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label>
          <p className="text-xs text-muted-foreground sm:col-span-2">{kind==='expense'?'Этот расход автоматически появится в финансах. Повторно записывать его не нужно.':kind==='withdrawal'?'Для изъятия владельцем или оплаты уже записанного расхода / зарплаты. Новый расход в финансах не создаётся.':kind==='opening'?'Укажите фактически пересчитанные деньги. Историческую выручку система не выдаёт за текущую наличность.':kind==='correction'?'Введите разницу между фактическим и учётным остатком. Например: −500 при недостаче. Причина обязательна.':'Внесение увеличивает наличность, но не считается выручкой.'}</p>
          <Button disabled={!valid} onClick={()=>void save()}>{busy?'Сохраняем…':kind==='opening'?'Зафиксировать остаток':'Сохранить операцию'}</Button>
        </fieldset>
      </div>}
      <div className="rounded-2xl border bg-card p-4"><h4 className="font-semibold">История кассы</h4><p className="mt-1 text-xs text-muted-foreground">Последние 100 операций. Остаток рассчитан по всей истории. Записи сохраняются при смене оператора.</p>{!data.entries.length&&<p className="mt-4 text-sm text-muted-foreground">Операций пока нет</p>}{data.entries.map(row=><article key={row.id} className="mt-4 min-w-0 border-t pt-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{row.label}{row.order_id?` · №${row.order_id}`:''}</strong><strong className={row.amount<0?'text-red-700':'text-emerald-700'}>{row.amount>0?'+':''}{money(row.amount)}</strong></div><p className="mt-1 break-words">{row.recipient&&`${row.recipient} · `}{row.reason}</p><p className="mt-1 text-xs text-muted-foreground">Оформил: {row.actor} · {new Date(row.created_at).toLocaleString('ru-KZ',{timeZone:'Asia/Almaty'})}</p></article>)}</div>
    </>}
  </section>;
}
