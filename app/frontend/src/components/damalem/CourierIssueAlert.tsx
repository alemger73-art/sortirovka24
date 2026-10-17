import {useEffect,useRef,useState} from 'react';
import {AlertTriangle} from 'lucide-react';
import {toast} from 'sonner';
import {useLanguage} from '@/contexts/LanguageContext';
import {foodOperations} from '@/lib/foodOperations';
import {Button} from '@/components/ui/button';
import {playDamOrderAlertSound} from '@/lib/damOrderAlertSound';

export default function CourierIssueAlert({onOpen}:{onOpen:()=>void}) {
  const {lang}=useLanguage();const language=useRef(lang);language.current=lang;
  const [count,setCount]=useState(0);
  useEffect(()=>{
    let alive=true,pending=false,seen:Set<number>|null=null;
    const poll=async()=>{
      if(pending)return;pending=true;
      try {
        const data=await foodOperations<{issues:Array<{id:number;order_id:number}>}>('/courier-work');
        if(!alive)return;
        const issues=data.issues||[];
        if(seen&&issues.some(i=>!seen!.has(i.id))) {
          toast.warning(language.current==='kz'?'Курьер жеткізу мәселесі туралы хабарлады':'Курьер сообщил о проблеме доставки');
          if(localStorage.getItem('dam_alem_order_alert_sound')!=='off')void playDamOrderAlertSound().catch(()=>{});
        }
        seen=new Set(issues.map(i=>i.id));setCount(issues.length);
      } catch { /* The main workplace handles loss of connection. */ }
      finally{pending=false;}
    };
    void poll();const timer=window.setInterval(()=>void poll(),5000);const focus=()=>void poll();
    window.addEventListener('focus',focus);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',focus);};
  },[]);
  return count>0?<section role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50 p-3 dark:bg-orange-950/30"><p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5"/>{lang==='kz'?'Курьер мәселелері':'Проблемы курьеров'}: {count}</p><Button variant="outline" className="min-h-11" onClick={onOpen}>{lang==='kz'?'Қарау және жауап беру':'Посмотреть и ответить'}</Button></section>:null;
}
