import { Input } from '@/components/ui/input';

export function scheduleISO(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}:00+05:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
export function scheduleLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime()+5*3600000).toISOString().slice(0,16);
}
export function scheduleLabel(value?: string | null): string {
  return value ? new Date(value).toLocaleString('ru-KZ',{timeZone:'Asia/Almaty',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
}
export default function PreorderFields({enabled,value,onEnabled,onChange}: {enabled:boolean;value:string;onEnabled:(value:boolean)=>void;onChange:(value:string)=>void}) {
  return <fieldset className="min-w-0 space-y-3 rounded-xl border p-3"><legend className="px-1 text-sm font-semibold">Когда получить заказ</legend><div className="flex flex-wrap gap-4"><label className="flex gap-2"><input type="radio" checked={!enabled} onChange={()=>onEnabled(false)}/>Сейчас</label><label className="flex gap-2"><input type="radio" checked={enabled} onChange={()=>onEnabled(true)}/>Предзаказ</label></div>{enabled&&<><label className="block">Дата и время<Input type="datetime-local" value={value} min={scheduleLocal(new Date().toISOString())} onChange={e=>onChange(e.target.value)}/></label><p className="text-xs text-muted-foreground">Местное время Караганды (UTC+5). Время проверяется по часам работы заведения.</p></>}</fieldset>;
}
