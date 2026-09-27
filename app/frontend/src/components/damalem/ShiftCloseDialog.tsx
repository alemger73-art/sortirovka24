import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { foodShifts, type FoodApiError, orderLabels } from '@/lib/foodOperations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Item = {name: string; quantity: string; unit: string; comment: string};
type Preview = {can_close: boolean; orders: {id: number; status: string; label: string; courier?: string}[]; counts: Record<string,number>};
export interface ProcurementView {
  shift_id: number; staff_name: string; created_at: string; opened_at: string; closed_at: string;
  items: {name: string; quantity: number; unit: string; comment: string}[];
  not_required: boolean; reason: string; comment: string; telegram_status: string; telegram_error?: string;
}
const blank = (): Item => ({name:'',quantity:'',unit:'кг',comment:''});

export default function ShiftCloseDialog({shiftId, pin, onClose, onClosed}: {shiftId: number; pin: string; onClose: () => void; onClosed: () => void}) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const [items,setItems] = useState<Item[]>([blank()]), [notRequired,setNotRequired] = useState(false);
  const [reason,setReason] = useState(''), [comment,setComment] = useState('');
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{let alive=true; foodShifts<Preview>('/close-preview').then(v=>{if(alive){setPreview(v);setError('');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[attempt]);
  const valid = notRequired ? reason.trim().length >= 3 : items.length > 0 && items.every(i=>i.name.trim() && i.unit.trim() && Number(i.quantity)>0 && Number(i.quantity)<=100000);
  async function closeShift() {
    if(busy || !valid) return;
    setBusy(true);setError('');
    try {await foodShifts('/close','POST',{pin,shift_id:shiftId,procurement:{not_required:notRequired,reason:notRequired?reason.trim():'',comment:comment.trim(),items:notRequired?[]:items.map(i=>({...i,quantity:Number(i.quantity)}))}});onClosed();}
    catch(e){const err=e as FoodApiError;setError(err.message);if(err.detail?.code==='active_orders')setPreview(err.detail as unknown as Preview);}
    finally{setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{preview && !preview.can_close?'Смену пока нельзя закрыть':'Закуп на следующую смену'}</DialogTitle></DialogHeader>
    {!preview && <p>Проверяем заказы…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {preview && !preview.can_close ? <div className="space-y-4"><p>В работе остаются заказы:</p><div className="flex flex-wrap gap-2">{Object.entries(preview.counts).map(([s,n])=><span key={s} className="rounded-lg bg-muted p-2">{orderLabels[s]||s}: {n}</span>)}</div><ul className="max-h-60 overflow-y-auto space-y-2">{preview.orders.map(o=><li key={o.id}><button className="text-left underline" onClick={()=>{onClose();navigate(`?section=orders&status=active&order=${o.id}`);}}>№{o.id} — {o.label}{o.courier?` — курьер ${o.courier}`:''}</button></li>)}</ul><Button onClick={()=>{onClose();navigate('?section=orders&status=active');}}>Перейти к заказам</Button><Button variant="outline" onClick={()=>setAttempt(v=>v+1)}>Проверить снова</Button></div> : preview && <fieldset disabled={busy} className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">Отчёт сохранится в истории смены. Сообщение в Telegram отправится отдельно; временная ошибка связи не потеряет закуп.</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={notRequired} onChange={e=>setNotRequired(e.target.checked)}/>Закуп не требуется</label>
      {notRequired?<label className="block">Причина<Input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Остатков достаточно"/></label>:<div className="space-y-3">{items.map((item,index)=><div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2"><label>Наименование<Input value={item.name} maxLength={120} onChange={e=>setItems(items.map((x,i)=>i===index?{...x,name:e.target.value}:x))}/></label><div className="grid grid-cols-2 gap-2"><label>Количество<Input type="number" min="0.001" step="any" value={item.quantity} onChange={e=>setItems(items.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></label><label>Единица<Input value={item.unit} maxLength={20} onChange={e=>setItems(items.map((x,i)=>i===index?{...x,unit:e.target.value}:x))}/></label></div><label>Комментарий к позиции<Input value={item.comment} maxLength={250} onChange={e=>setItems(items.map((x,i)=>i===index?{...x,comment:e.target.value}:x))}/></label><Button variant="ghost" onClick={()=>setItems(items.filter((_,i)=>i!==index))}>Удалить позицию {index+1}</Button></div>)}<Button variant="outline" disabled={items.length>=50} onClick={()=>setItems([...items,blank()])}>+ Добавить позицию</Button></div>}
      <label className="block">Комментарий к закупу<Input value={comment} maxLength={1000} onChange={e=>setComment(e.target.value)}/></label>
      <Button className="w-full h-auto min-h-11 whitespace-normal" disabled={busy||!valid} onClick={()=>void closeShift()}>Сохранить закуп и закрыть смену</Button>
    </fieldset>}
    {!preview&&error&&<Button onClick={()=>setAttempt(v=>v+1)}>Повторить проверку</Button>}
  </DialogContent></Dialog>;
}
