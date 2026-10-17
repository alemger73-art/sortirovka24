import {useEffect,useState} from 'react';
import {foodOperations} from '@/lib/foodOperations';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
export default function DeliveryZoneDialog({orderId,version,onClose,onSaved}:{orderId:number;version:number;onClose:()=>void;onSaved:()=>void}){
 const [zones,setZones]=useState<{id:string;name:string;price:number;courier_payout?:number|null}[]>([]),[zone,setZone]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void foodOperations<{delivery_options:typeof zones}>('/catalog').then(data=>{if(active)setZones(data.delivery_options);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function save(){if(busy||!zone)return;setBusy(true);setError('');try{await foodOperations(`/orders/${orderId}/delivery-zone`,'POST',{expected_version:version,zone_id:zone});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent><DialogHeader><DialogTitle>Уточнить зону доставки</DialogTitle></DialogHeader><p>Для прежнего заказа сохраняются сумма клиента, наличные и сдача. Выбранная зона фиксирует выплату курьеру по тарифу владельца.</p><select aria-label="Зона доставки" className="rounded-lg border bg-background p-3" value={zone} disabled={busy} onChange={e=>setZone(e.target.value)}><option value="">Выберите зону</option>{zones.map(z=><option key={z.id} value={z.id} disabled={z.courier_payout==null}>{z.name} — курьер {z.courier_payout ?? 'тариф не настроен'} ₸</option>)}</select>{error&&<p role="alert">{error}</p>}<Button disabled={busy||!zone} onClick={()=>void save()}>Зафиксировать зону и тариф</Button></DialogContent></Dialog>;
}
