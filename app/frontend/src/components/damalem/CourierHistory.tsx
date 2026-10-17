import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/contexts/LanguageContext';
import {logisticsApi,type LogisticsTask} from '@/lib/logisticsApi';
import CourierTaskCard from './CourierTaskCard';

export default function CourierHistory() {
  const {lang}=useLanguage();const say=(ru:string,kz:string)=>lang==='kz'?kz:ru;
  const [items,setItems]=useState<LogisticsTask[]>([]),[cursor,setCursor]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const request=useRef<AbortController|null>(null);const loading=useRef(false);const version=useRef(0);
  async function load(reset=false) {
    if(loading.current)return;loading.current=true;setBusy(true);setError('');
    const id=++version.current;request.current=new AbortController();
    try {
      const result=await logisticsApi.courierHistory(reset?undefined:cursor||undefined,request.current.signal);
      if(id!==version.current)return;
      setItems(old=>reset?result.items:[...new Map([...old,...result.items].map(t=>[t.id,t])).values()]);
      setCursor(result.next_cursor);setLoaded(true);
    } catch(e) {if(id===version.current)setError((e as Error).message);}
    finally{if(id===version.current){loading.current=false;setBusy(false);}}
  }
  useEffect(()=>{loading.current=false;void load(true);return()=>{version.current++;loading.current=false;request.current?.abort();};},[]);
  return <section className="space-y-4"><div className="flex items-center justify-between gap-2"><h2 className="text-xl font-bold">{say('История доставок','Жеткізу тарихы')}</h2><Button variant="outline" className="min-h-11" disabled={busy} onClick={()=>void load(true)}>{say('Обновить','Жаңарту')}</Button></div><p className="text-sm text-muted-foreground">{say('Завершённые и отменённые заказы. Начисления показаны по денежному журналу.','Аяқталған және жойылған тапсырыстар. Есептелген сома ақша журналынан көрсетіледі.')}</p>{error&&<div role="alert" className="rounded-xl border border-amber-300 p-3"><p>{error}</p><Button variant="outline" className="min-h-11" disabled={busy} onClick={()=>void load(!loaded)}>{say('Повторить','Қайталау')}</Button></div>}{loaded&&!items.length&&<p className="rounded-2xl border bg-card p-5">{say('Завершённых доставок пока нет.','Аяқталған жеткізулер әлі жоқ.')}</p>}{items.map(t=><CourierTaskCard key={t.id} task={t} historical/>)}{busy&&<p role="status">{say('Загружаем историю…','Тарих жүктелуде…')}</p>}{cursor&&!busy&&<Button variant="outline" className="min-h-12 w-full" onClick={()=>void load()}>{say('Показать ещё','Тағы көрсету')}</Button>}</section>;
}
