import { useLanguage } from '@/contexts/LanguageContext';
import { coverageRows, type Inspector, type Coverage } from '@/lib/inspectorDirectory';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function InspectorCoverageEditor({value,legacy,onChange}:{value?:string;legacy?:string;onChange:(value:string)=>void}) {
  const { t: adminT } = useLanguage();

  let rows: Coverage[];
  try { const parsed = value ? JSON.parse(value) : null; rows = Array.isArray(parsed) ? parsed : coverageRows({streets:legacy} as Inspector); }
  catch { rows=coverageRows({streets:legacy} as Inspector); }
  const change=(next:Coverage[])=>onChange(JSON.stringify(next));
  return <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-3">
    <h3 className="text-sm font-semibold">{adminT('admin.editor.0')}</h3>
    <p className="text-xs leading-relaxed text-slate-600">{adminT('admin.editor.1')}</p>
    {rows.map((row,index)=><div key={index} className="grid gap-2 rounded-lg bg-white p-2">
      <label className="text-xs">{adminT('admin.editor.2')} {index+1}<Input value={row.street} onChange={e=>change(rows.map((r,i)=>i===index?{...r,street:e.target.value}:r))}/></label>
      <label className="text-xs">{adminT('admin.editor.3')}<Input value={row.houses} onChange={e=>change(rows.map((r,i)=>i===index?{...r,houses:e.target.value}:r))}/></label>
      <Button type="button" variant="ghost" onClick={()=>change(rows.filter((_,i)=>i!==index))}>{adminT('admin.editor.4')}</Button>
    </div>)}
    <Button type="button" variant="outline" onClick={()=>change([...rows,{street:'',houses:''}])}>{adminT('admin.editor.5')}</Button>
  </div>;
}
