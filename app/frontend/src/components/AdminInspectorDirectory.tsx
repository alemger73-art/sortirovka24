import { useLanguage } from '@/contexts/LanguageContext';
import { directoryRequest } from '@/lib/inspectorDirectoryApi';
import { useEffect, useRef, useState } from 'react';
import { emptyDirectory, type DirectoryData } from '@/lib/inspectorDirectory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Plus, Trash2 } from 'lucide-react';

export default function AdminInspectorDirectory() {
  const { t: adminT } = useLanguage();

  const [data,setData]=useState<DirectoryData>(emptyDirectory);
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const busy=useRef(false);
  async function load() {
    setLoading(true); setError('');
    try { setData(await directoryRequest()); setReady(true); }
    catch { setError(adminT("admin.ui.1276")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); },[]);
  function set<K extends keyof DirectoryData>(key:K,value:DirectoryData[K]) { setData(old => ({...old,[key]:value})); setSaved(false); }
  async function save(e:React.FormEvent) {
    e.preventDefault(); if(busy.current || !ready) return;
    busy.current=true; setSaving(true); setError(''); setSaved(false);
    try { setData(await directoryRequest(data)); setSaved(true); }
    catch(e) { setError(e instanceof Error ? e.message : adminT("admin.ui.0055")); }
    finally { busy.current=false;setSaving(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:bg-slate-900 dark:border-slate-700">
    <div className="flex items-center gap-3 mb-3"><Building2 className="text-blue-700"/><div><h2 className="font-bold text-lg">{adminT("admin.ui.1277")}</h2><p className="text-sm text-slate-500">{adminT("admin.ui.1278")}</p></div></div>
    <a href="/inspectors" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">{adminT("admin.ui.1279")}</a>
    {error && <div role="alert" className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}<button type="button" className="block min-h-11 underline" onClick={() => void load()} disabled={saving}>{adminT("admin.ui.1280")}</button></div>}
    {loading ? <p role="status">{adminT("admin.ui.1205")}</p> : <form onSubmit={save}><fieldset disabled={!ready || saving} className="space-y-4 disabled:opacity-60">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">{adminT("admin.ui.1281")}<Input value={data.department_name} maxLength={180} onChange={e=>set('department_name',e.target.value)} placeholder={adminT("admin.ui.1282")}/></label>
        <label className="text-sm">{adminT("admin.ui.1283")}<Input value={data.address} maxLength={500} onChange={e=>set('address',e.target.value)} placeholder={adminT("admin.ui.1284")}/></label>
        <label className="text-sm">{adminT("admin.ui.1285")}<Input type="tel" value={data.duty_phone} maxLength={40} onChange={e=>set('duty_phone',e.target.value)} placeholder={adminT("admin.ui.1286")}/></label>
        <label className="text-sm">{adminT("admin.ui.1287")}<Input type="tel" value={data.duty_whatsapp} maxLength={40} onChange={e=>set('duty_whatsapp',e.target.value)} placeholder={adminT("admin.ui.0468")}/></label>
        <label className="text-sm">{adminT("admin.ui.1288")}<Input type="url" value={data.map_url} maxLength={1000} onChange={e=>set('map_url',e.target.value)} placeholder="https://…"/></label>
        <label className="text-sm">{adminT("admin.ui.1289")}<Input value={data.reception_schedule} maxLength={500} onChange={e=>set('reception_schedule',e.target.value)} placeholder={adminT("admin.ui.1290")}/></label>
        <label className="text-sm">{adminT("admin.ui.1291")}<Input type="url" value={data.source_url} maxLength={1000} onChange={e=>set('source_url',e.target.value)} placeholder="https://www.gov.kz/…"/></label>
        <label className="text-sm">{adminT("admin.ui.1292")}<Input type="date" value={data.verified_on || ''} onChange={e=>set('verified_on',e.target.value || null)}/></label>
      </div>
      <label className="block text-sm">{adminT("admin.ui.1293")}<Textarea value={data.notice} maxLength={1000} onChange={e=>set('notice',e.target.value)} placeholder={adminT("admin.ui.1294")}/></label>
      <div className="border-t pt-4"><h3 className="font-semibold">{adminT("admin.ui.1295")}</h3><p className="text-xs text-slate-500 mt-1 mb-4">{adminT("admin.ui.1296")}</p>
        {data.tips.map((tip,index)=><div key={index} className="rounded-xl border p-3 mb-3 space-y-3">
          <label className="block text-sm">{adminT("admin.ui.1297")} {index+1}<Input required maxLength={120} value={tip.title} onChange={e=>set('tips',data.tips.map((t,i)=>i===index?{...t,title:e.target.value}:t))}/></label>
          <label className="block text-sm">{adminT("admin.ui.1298")}<Textarea required maxLength={1800} value={tip.body} onChange={e=>set('tips',data.tips.map((t,i)=>i===index?{...t,body:e.target.value}:t))}/></label>
          <label className="block text-sm">{adminT("admin.ui.1299")}<Input type="url" maxLength={1000} value={tip.source_url} onChange={e=>set('tips',data.tips.map((t,i)=>i===index?{...t,source_url:e.target.value}:t))}/></label>
          <Button type="button" variant="outline" onClick={()=>set('tips',data.tips.filter((_,i)=>i!==index))}><Trash2 size={15} className="mr-2"/>{adminT("admin.ui.1300")}</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={data.tips.length>=8} onClick={()=>set('tips',[...data.tips,{title:'',body:'',source_url:''}])}><Plus size={16} className="mr-2"/>{adminT("admin.ui.1301")}</Button>
      </div>
      <Button type="submit" className="bg-blue-700 text-white">{saving?adminT("admin.ui.1302"):adminT("admin.ui.1303")}</Button>
      {saved && <p role="status" className="text-sm text-green-700">{adminT("admin.ui.1304")}</p>}
    </fieldset></form>}
    <p className="mt-5 text-sm text-slate-500">{adminT("admin.ui.1305")}</p>
  </section>;
}
