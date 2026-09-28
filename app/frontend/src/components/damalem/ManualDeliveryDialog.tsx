import {useRef, useState} from 'react';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {foodOperations, type OperatorOrder} from '@/lib/foodOperations';

export default function ManualDeliveryDialog({order, onClose, onSaved}: {order: OperatorOrder; onClose: () => void; onSaved: () => void}) {
  const due = Math.max(0, order.total_amount-Number(order.paid_amount ?? (order.payment_status === 'paid' ? order.total_amount : 0)));
  const cash = order.payment_method === 'cash' && due > 0;
  const [reason,setReason] = useState('courier'), [received,setReceived] = useState(''), [amount,setAmount] = useState(String(due));
  const [comment,setComment] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const unusual = reason === 'other' || cash && (received === 'no' || received === 'yes' && Number(amount) !== due);
  async function save() {
    if (lock.current) return;
    lock.current = true;setBusy(true);setError('');
    try {
      await foodOperations(`/orders/${order.id}/manual-delivery`, 'POST', {expected_version:order.version || 0,
        reason, comment, ...(cash ? {cash_received:received === 'yes', ...(received === 'yes' ? {amount:Number(amount)} : {})} : {})});
      onSaved();
    } catch (e) {setError((e as Error).message);} finally {lock.current=false;setBusy(false);}
  }
  return <Dialog open onOpenChange={open => {if(!open&&!busy)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Завершить доставку №{order.id} вручную</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">Действие сохранится в истории под вашим именем. Полученные курьером наличные останутся у него до передачи в кассу.</p>
    <label>Кто подтвердил?<select className="mt-1 w-full rounded-lg border bg-background p-3" value={reason} onChange={e=>setReason(e.target.value)}><option value="courier">Курьер сообщил</option><option value="customer">Клиент подтвердил</option><option value="other">Другое</option></select></label>
    {cash && <><fieldset><legend className="font-semibold">Деньги получены?</legend><div className="flex gap-3 mt-2">{[['yes','Да'],['no','Нет']].map(([v,t])=><label key={v} className="flex min-h-11 items-center gap-2 rounded-lg border px-4"><input type="radio" name="money-received" value={v} checked={received===v} onChange={()=>setReceived(v)}/>{t}</label>)}</div></fieldset>
      {received==='yes' && <label>Полученная сумма, ₸<Input type="number" min="0.01" max={due} value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
      {received==='no' && <p className="text-amber-700">Заказ будет доставлен, но останется неоплаченным и будет мешать закрытию смены.</p>}</>}
    <label>Комментарий{unusual?' — обязателен':''}<Input maxLength={1000} value={comment} onChange={e=>setComment(e.target.value)}/></label>
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    <Button disabled={busy || cash&&!received || unusual&&comment.trim().length<3 || received==='yes'&&(!Number(amount)||Number(amount)>due)} onClick={()=>void save()}>Подтвердить завершение</Button>
  </DialogContent></Dialog>;
}
