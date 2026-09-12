import { directoryRequest } from '@/lib/inspectorDirectoryApi';
import { useEffect, useRef, useState } from 'react';
import { emptyDirectory, type DirectoryData } from '@/lib/inspectorDirectory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Plus, Trash2 } from 'lucide-react';

export default function AdminInspectorDirectory() {
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
    catch { setError('Не удалось загрузить сведения об отделе. Проверьте подключение и наличие обновления сервера.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); },[]);
  function set<K extends keyof DirectoryData>(key:K,value:DirectoryData[K]) { setData(old => ({...old,[key]:value})); setSaved(false); }
  async function save(e:React.FormEvent) {
    e.preventDefault(); if(busy.current || !ready) return;
    busy.current=true; setSaving(true); setError(''); setSaved(false);
    try { setData(await directoryRequest(data)); setSaved(true); }
    catch(e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения'); }
    finally { busy.current=false;setSaving(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:bg-slate-900 dark:border-slate-700">
    <div className="flex items-center gap-3 mb-3"><Building2 className="text-blue-700"/><div><h2 className="font-bold text-lg">Отдел полиции и полезная информация</h2><p className="text-sm text-slate-500">Контакты отдела отдельно от карточек сотрудников. Пустые телефоны не показываются как кнопки.</p></div></div>
    <a href="/inspectors" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">Посмотреть страницу для жителей</a>
    {error && <div role="alert" className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}<button type="button" className="block min-h-11 underline" onClick={() => void load()} disabled={saving}>Загрузить сохранённые сведения заново</button></div>}
    {loading ? <p role="status">Загрузка…</p> : <form onSubmit={save}><fieldset disabled={!ready || saving} className="space-y-4 disabled:opacity-60">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Название отдела<Input value={data.department_name} maxLength={180} onChange={e=>set('department_name',e.target.value)} placeholder="Официальное название отдела полиции"/></label>
        <label className="text-sm">Адрес отдела<Input value={data.address} maxLength={500} onChange={e=>set('address',e.target.value)} placeholder="Город, улица, номер здания"/></label>
        <label className="text-sm">Телефон дежурной части<Input type="tel" value={data.duty_phone} maxLength={40} onChange={e=>set('duty_phone',e.target.value)} placeholder="С кодом города или страны"/></label>
        <label className="text-sm">WhatsApp дежурной части (если есть)<Input type="tel" value={data.duty_whatsapp} maxLength={40} onChange={e=>set('duty_whatsapp',e.target.value)} placeholder="Отдельный подтверждённый номер"/></label>
        <label className="text-sm">Ссылка на отдел в картах<Input type="url" value={data.map_url} maxLength={1000} onChange={e=>set('map_url',e.target.value)} placeholder="https://…"/></label>
        <label className="text-sm">Часы приёма граждан<Input value={data.reception_schedule} maxLength={500} onChange={e=>set('reception_schedule',e.target.value)} placeholder="Уточнённое расписание"/></label>
        <label className="text-sm">Официальный источник сведений<Input type="url" value={data.source_url} maxLength={1000} onChange={e=>set('source_url',e.target.value)} placeholder="https://www.gov.kz/…"/></label>
        <label className="text-sm">Когда вы проверили контакты<Input type="date" value={data.verified_on || ''} onChange={e=>set('verified_on',e.target.value || null)}/></label>
      </div>
      <label className="block text-sm">Объявление для жителей<Textarea value={data.notice} maxLength={1000} onChange={e=>set('notice',e.target.value)} placeholder="Например, временное изменение места приёма. Не заполняйте без подтверждения."/></label>
      <div className="border-t pt-4"><h3 className="font-semibold">Памятки и статьи</h3><p className="text-xs text-slate-500 mt-1 mb-4">Коротко объясните ситуацию и укажите источник. Не обещайте точный штраф без проверки актуальной редакции закона.</p>
        {data.tips.map((tip,index)=><div key={index} className="rounded-xl border p-3 mb-3 space-y-3">
          <label className="block text-sm">Заголовок памятки {index+1}<Input required maxLength={120} value={tip.title} onChange={e=>set('tips',data.tips.map((t,i)=>i===index?{...t,title:e.target.value}:t))}/></label>
          <label className="block text-sm">Пояснение<Textarea required maxLength={1800} value={tip.body} onChange={e=>set('tips',data.tips.map((t,i)=>i===index?{...t,body:e.target.value}:t))}/></label>
          <label className="block text-sm">Ссылка на источник<Input type="url" maxLength={1000} value={tip.source_url} onChange={e=>set('tips',data.tips.map((t,i)=>i===index?{...t,source_url:e.target.value}:t))}/></label>
          <Button type="button" variant="outline" onClick={()=>set('tips',data.tips.filter((_,i)=>i!==index))}><Trash2 size={15} className="mr-2"/>Убрать памятку</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={data.tips.length>=8} onClick={()=>set('tips',[...data.tips,{title:'',body:'',source_url:''}])}><Plus size={16} className="mr-2"/>Добавить памятку</Button>
      </div>
      <Button type="submit" className="bg-blue-700">{saving?'Сохраняем…':'Сохранить сведения об отделе'}</Button>
      {saved && <p role="status" className="text-sm text-green-700">Сведения сохранены. Они доступны на странице для жителей.</p>}
    </fieldset></form>}
    <p className="mt-5 text-sm text-slate-500">Начальника добавьте ниже как сотрудника с переключателем «Руководство». Укажите должность «Начальник отдела полиции» и порядок 0. Фото обязательно.</p>
  </section>;
}
