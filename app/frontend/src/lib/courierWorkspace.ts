import type { LogisticsTask } from './logisticsApi';

export function courierAction(task:LogisticsTask) {
  const waiting=['new','confirmed','preparing'].includes(task.order_status||'');
  if(task.status==='assigned')return {phase:waiting?'kitchen':'ready',next:waiting?null:'picked_up',label:waiting?'Готовится на кухне':'Принял заказ'} as const;
  if(['picked_up','on_the_way','arrived'].includes(task.status))return {phase:'delivery',next:'delivered',label:'Доставлено'} as const;
  return {phase:'complete',next:null,label:'Доставка завершена'} as const;
}

export function courierPhone(raw?:string|null) {
  if(!raw || !/^[+\d()\s.-]+$/.test(raw))return null;
  let digits=raw.replace(/\D/g,'');
  if(digits.length===10)digits='7'+digits;
  else if(digits.length===11&&digits.startsWith('8'))digits='7'+digits.slice(1);
  if(!/^[1-9]\d{10,14}$/.test(digits))return null;
  return {tel:`tel:+${digits}`,whatsapp:`https://wa.me/${digits}`};
}

export function courierRoute(task:LogisticsTask) {
  const lat=task.dropoff_lat,lng=task.dropoff_lng;
  if(lat!=null&&lng!=null&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)
    return `https://2gis.kz/directions/points/|${lng},${lat}`;
  const address=task.dropoff_address?.trim();
  return address?`https://2gis.kz/karaganda/search/${encodeURIComponent(address)}`:null;
}
