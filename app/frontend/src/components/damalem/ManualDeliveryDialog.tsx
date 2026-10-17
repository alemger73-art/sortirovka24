import {useRef, useState} from 'react';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {foodOperations, type OperatorOrder} from '@/lib/foodOperations';

export default function ManualDeliveryDialog({order, onClose, onSaved}: {order: OperatorOrder; onClose: () => void; onSaved: () => void}) {
  const [reason,setReason] = useState('courier');
  const [comment,setComment] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const unusual = reason === 'other';
  async function save() {
    if (lock.current) return;
    lock.current = true;setBusy(true);setError('');
    try {
      await foodOperations(`/orders/${order.id}/manual-delivery`, 'POST', {expected_version:order.version || 0,
        reason, comment});
      onSaved();
    } catch (e) {setError((e as Error).message);} finally {lock.current=false;setBusy(false);}
  }
  return <Dialog open onOpenChange={open => {if(!open&&!busy)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Завершить доставку №{order.id} вручную</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">Действие сохранится в истории под вашим именем. Оплату оператор подтверждает отдельно в карточке заказа. Передачу денег дополнительно подтверждать не нужно.</p>
    <label>Кто подтвердил?<select className="mt-1 w-full rounded-lg border bg-background p-3" value={reason} onChange={e=>setReason(e.target.value)}><option value="courier">Курьер сообщил</option><option value="customer">Клиент подтвердил</option><option value="other">Другое</option></select></label>
    <label>Комментарий{unusual?' — обязателен':''}<Input maxLength={1000} value={comment} onChange={e=>setComment(e.target.value)}/></label>
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    <Button disabled={busy || unusual&&comment.trim().length<3} onClick={()=>void save()}>Подтвердить завершение</Button>
  </DialogContent></Dialog>;
}
