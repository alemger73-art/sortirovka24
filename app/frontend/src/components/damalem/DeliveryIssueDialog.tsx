import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {foodOperations} from '@/lib/foodOperations';
const reasons={no_answer:'Клиент не отвечает',wrong_address:'Неверный адрес',refused:'Отказ клиента',payment:'Проблема с оплатой',other:'Другое'};
export default function DeliveryIssueDialog({id,onClose,onSaved}:{id:number;onClose:()=>void;onSaved:()=>void}) {
  const [reason,setReason]=useState('no_answer'),[comment,setComment]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(){if(busy)return;setBusy(true);setError('');try{await foodOperations(`/orders/${id}/delivery-issue`,'POST',{reason,comment});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent><DialogHeader><DialogTitle>Проблема доставки №{id}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Сообщение останется в истории. Оно не отменяет заказ, не подтверждает оплату и не оформляет возврат.</p><label>Причина<select className="mt-1 w-full rounded-lg border bg-background p-3" value={reason} onChange={e=>setReason(e.target.value)}>{Object.entries(reasons).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Комментарий{reason==='other'?' — обязателен':''}<textarea className="mt-1 w-full rounded-lg border bg-background p-3" maxLength={1000} value={comment} onChange={e=>setComment(e.target.value)}/></label>{error&&<p role="alert" className="text-destructive">{error}</p>}<Button disabled={busy||reason==='other'&&!comment.trim()} onClick={()=>void save()}>Сохранить проблему</Button></DialogContent></Dialog>;
}
