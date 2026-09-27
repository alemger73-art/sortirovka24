import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import {foodOperations,type OperatorOrder} from '@/lib/foodOperations';
import {scheduleLabel} from './PreorderFields';

export default function PreorderNotice(){
  const [count,setCount]=useState(0),seen=useRef<Set<number>|null>(null);
  const navigate=useNavigate();
  useEffect(()=>{let alive=true;const poll=async()=>{try{
    const data=await foodOperations<{items:OperatorOrder[];total:number}>('/orders?status=preorders&limit=100');
    if(!alive)return;setCount(data.total);
    const added=data.items.filter(o=>o.status==='new'&&seen.current&&!seen.current.has(o.id));
    if(added.length)toast.info(`Новый предзаказ №${added[0].id} на ${scheduleLabel(added[0].scheduled_for)}`,{duration:8000});
    seen.current=new Set(data.items.map(o=>o.id));
  }catch{/* Queue page displays connection errors. */}};void poll();const timer=window.setInterval(()=>void poll(),15000);return()=>{alive=false;clearInterval(timer);};},[]);
  if(!count)return null;
  return <button className="w-full rounded-xl border border-sky-300 bg-sky-50 p-3 text-left text-sky-950 dark:bg-sky-950 dark:text-sky-100" onClick={()=>navigate('?section=orders&status=preorders')}>Предзаказы — {count} · Посмотреть дату и время →</button>;
}
