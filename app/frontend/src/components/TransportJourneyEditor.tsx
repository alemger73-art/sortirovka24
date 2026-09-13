import { useLanguage } from '@/contexts/LanguageContext';
import { useState } from 'react';
import { type Journey, type DirectionKey, type DayKey, type DaySchedule } from '@/lib/transportSchedule';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
export default function TransportJourneyEditor({value,onChange}:{value:Journey;onChange:(v:Journey)=>void}){
  const { t: adminT } = useLanguage();

 const [direction,setDirection]=useState<DirectionKey>('outbound');const [day,setDay]=useState<DayKey>('weekday');
 const current=value[direction],schedule=current[day];
 const update=(key:keyof DaySchedule,v:string|boolean)=>onChange({...value,[direction]:{...current,[day]:{...schedule,[key]:v}}});
 return <section className="rounded-xl border p-4 space-y-4"><h3 className="font-semibold">{adminT('admin.editor.6')}</h3><div className="flex flex-wrap gap-2">{(['outbound','inbound']as const).map(d=><button type="button" key={d} aria-pressed={d===direction} className={`min-h-11 rounded-lg border px-3 text-sm ${d===direction?'bg-blue-100 text-blue-900':'bg-background'}`} onClick={()=>setDirection(d)}>{d==='outbound'?adminT('admin.editor.7'):adminT('admin.editor.8')}</button>)}</div>
 <label className="grid gap-2 text-sm font-medium">{adminT('admin.editor.9')}<Textarea aria-label={adminT('admin.editor.9')} rows={6} value={current.stops.join('\n')} onChange={e=>onChange({...value,[direction]:{...current,stops:e.target.value.split('\n')}})} placeholder={adminT('admin.editor.10')}/></label><p className="text-xs text-slate-500">{adminT('admin.editor.11')}</p>
 <div className="flex flex-wrap gap-2">{([['weekday',adminT('admin.editor.12')],['saturday',adminT('admin.editor.13')],['sunday',adminT('admin.editor.14')]]as const).map(([d,label])=><button type="button" key={d} aria-pressed={d===day} className={`min-h-11 border rounded-lg px-3 text-sm ${d===day?'bg-blue-100 text-blue-900':'bg-background'}`} onClick={()=>setDay(d)}>{label}</button>)}</div>
 <p className="text-sm">{adminT('admin.editor.15')} <strong>{current.stops[0]||adminT('admin.editor.16')}</strong>{adminT('admin.editor.17')}</p>
 <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schedule.not_running} onChange={e=>onChange({...value,[direction]:{...current,[day]:e.target.checked?{times:'',first:'',last:'',interval:'',not_running:true}:{...schedule,not_running:false}}})}/>{adminT('admin.editor.18')}</label>
 {!schedule.not_running&&<><label className="grid gap-2 text-sm font-medium">{adminT('admin.editor.19')}<Textarea aria-label={adminT('admin.editor.19')} value={schedule.times} onChange={e=>update('times',e.target.value)} rows={3} placeholder={adminT('admin.editor.20')}/></label><p className="text-xs text-slate-500">{adminT('admin.editor.21')}</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="grid gap-2 text-sm">{adminT('admin.editor.22')}<Input type="time" value={schedule.first} onChange={e=>update('first',e.target.value)}/></label><label className="grid gap-2 text-sm">{adminT('admin.editor.23')}<Input type="time" value={schedule.last} onChange={e=>update('last',e.target.value)}/></label><label className="grid gap-2 text-sm">{adminT('admin.editor.24')}<Input maxLength={80} value={schedule.interval} onChange={e=>update('interval',e.target.value)} placeholder={adminT('admin.editor.25')}/></label></div></>}
 </section>;
}
