import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { partnerProfiles, emptyPartner, type PartnerProfile } from '@/lib/partnerProfiles';
import ImageUpload from '@/components/ImageUpload';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AdminPartnerProfiles() {
  const [items, setItems] = useState<PartnerProfile[]>([]);
  const [edit, setEdit] = useState<PartnerProfile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const originalSlug = useRef('');
  const uploads = useRef(new Set<string>());
  const [uploading, setUploading] = useState(false);
  const load = () => { setLoading(true); setError(''); partnerProfiles.list(true).then(r=>setItems(r.items)).catch(e=>setError(e.message)).finally(()=>setLoading(false)); };
  useEffect(load, []);
  const uploadState = (key: string, value: boolean) => { if (value) uploads.current.add(key); else uploads.current.delete(key); setUploading(uploads.current.size > 0); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if(!edit || busy.current || uploading) return;
    if (!originalSlug.current && items.some(p=>p.slug===edit.slug)) { toast.error('Этот адрес уже занят. Выберите другой.'); return; }
    busy.current = true; setSaving(true);
    try { await partnerProfiles.save({...edit,services:edit.services.map(s=>s.trim()).filter(Boolean)}); toast.success('Карточка сохранена'); setEdit(null); load(); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'Не удалось сохранить'); }
    finally { busy.current = false; setSaving(false); }
  };
  const field = (key: keyof PartnerProfile, label: string, required=false, multiline=false) => <label className="block text-sm font-medium" key={key}>{label}{required && ' *'}{multiline ? <textarea required={required} rows={4} value={String(edit?.[key] || '')} onChange={e=>setEdit({...edit!,[key]:e.target.value})} className="mt-1 w-full rounded-lg border bg-transparent p-3" /> : <input required={required} value={String(edit?.[key] || '')} onChange={e=>setEdit({...edit!,[key]:e.target.value})} className="mt-1 w-full rounded-lg border bg-transparent p-3" />}</label>;
  return <section className="mb-8 space-y-4 rounded-2xl border p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Партнёры на сайте</h2><p className="mt-1 text-sm text-gray-500">Страницы компаний с услугами, фотографиями и контактами. Заявки на сотрудничество — ниже.</p></div><Button onClick={()=>{ originalSlug.current=''; setEdit({...emptyPartner}); }}>Добавить компанию</Button></div>
    {loading && <p role="status">Загрузка…</p>}{error && <div role="alert">{error}<Button variant="outline" onClick={load}>Повторить</Button></div>}
    {items.map(p=><div key={p.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h3 className="font-semibold">{p.name}</h3><p className="text-sm text-gray-500">{p.category} · {p.published ? 'Опубликовано' : 'Черновик / скрыто'}</p></div><div className="flex gap-2">{p.published && <Link className="rounded-lg border px-3 py-2 text-sm" to={`/partners/${p.slug}`}>Открыть</Link>}<Button variant="outline" onClick={()=>{ originalSlug.current=p.slug; setEdit(structuredClone(p)); }}>Изменить</Button></div></div>)}
    {!loading && !error && !items.length && <p className="text-sm text-gray-500">Добавьте первую компанию. Черновики посетителям не видны.</p>}
    <Dialog open={!!edit} onOpenChange={open=>{if(!open && !saving && !uploading) setEdit(null);}}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Карточка компании</DialogTitle></DialogHeader>{edit && <form onSubmit={save} className="space-y-5">
      <fieldset disabled={saving} className="space-y-5">
      <label className="block text-sm font-medium">Адрес страницы *<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={!!originalSlug.current} value={edit.slug} onChange={e=>setEdit({...edit,slug:e.target.value})} placeholder="krovlya-365" className="mt-1 w-full rounded-lg border bg-transparent p-3" /><span className="text-xs text-gray-500">Латиница, цифры и дефис. После создания адрес сохраняется.</span></label>
      <div className="grid gap-4 sm:grid-cols-2">{field('name','Название компании',true)}{field('category','Направление',true)}</div>
      {field('headline','Коротко о компании',true)}{field('description','О компании',true,true)}
      <div className="grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-sm font-medium">Логотип</p><ImageUpload folder="partners" value={edit.logo} onChange={logo=>setEdit(p=>p&&({...p,logo}))} onUploadingChange={v=>uploadState('logo',v)} /></div><div><p className="mb-2 text-sm font-medium">Обложка</p><ImageUpload folder="partners" value={edit.cover} onChange={cover=>setEdit(p=>p&&({...p,cover}))} onUploadingChange={v=>uploadState('cover',v)} /></div></div>
      <div className="grid gap-4 sm:grid-cols-2">{field('phone','Телефон +7…')}{field('whatsapp','WhatsApp +7…')}{field('instagram','Instagram (https://…)')}{field('area','Город и районы работы')}{field('address','Адрес офиса, если есть')}{field('hours','Часы работы')}</div>
      <label className="block text-sm font-medium">Услуги — каждая с новой строки<textarea rows={6} value={edit.services.join('\n')} onChange={e=>setEdit({...edit,services:e.target.value.split('\n')})} className="mt-1 w-full rounded-lg border bg-transparent p-3" /></label>
      {field('offer','Спецпредложение (необязательно)')}{field('offer_terms','Условия предложения',false,true)}
      <div><h3 className="font-semibold">Фотографии и видео</h3><p className="text-sm text-gray-500">Для видео добавьте обложку и ссылку на исходную публикацию. Видео не запускается автоматически.</p>{edit.works.map((w,i)=><div key={i} className="mt-4 space-y-3 rounded-xl border p-4"><label className="block text-sm">Название<input required value={w.title} onChange={e=>setEdit({...edit,works:edit.works.map((x,j)=>j===i?{...x,title:e.target.value}:x)})} className="mt-1 w-full rounded border bg-transparent p-2" /></label><ImageUpload folder="partners" value={w.image} onChange={image=>setEdit(p=>p&&({...p,works:p.works.map((x,j)=>j===i?{...x,image}:x)}))} onUploadingChange={v=>uploadState(`work-${i}`,v)} /><label className="block text-sm">Подпись<input value={w.caption} onChange={e=>setEdit({...edit,works:edit.works.map((x,j)=>j===i?{...x,caption:e.target.value}:x)})} className="mt-1 w-full rounded border bg-transparent p-2" /></label><label className="block text-sm">Ссылка на публикацию<input type="url" value={w.source} onChange={e=>setEdit({...edit,works:edit.works.map((x,j)=>j===i?{...x,source:e.target.value}:x)})} className="mt-1 w-full rounded border bg-transparent p-2" /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={w.kind==='video'} onChange={e=>setEdit({...edit,works:edit.works.map((x,j)=>j===i?{...x,kind:e.target.checked?'video':'photo'}:x)})} />Это видео</label><Button type="button" variant="outline" disabled={uploading} onClick={()=>setEdit({...edit,works:edit.works.filter((_,j)=>i!==j)})}>Убрать материал</Button></div>)}<Button type="button" className="mt-3" variant="outline" disabled={edit.works.length>=12 || uploading} onClick={()=>setEdit({...edit,works:[...edit.works,{title:'',image:'',source:'',kind:'photo',caption:''}]})}>Добавить фото / видео</Button></div>
      <label className="flex items-center gap-3 font-medium"><input type="checkbox" checked={edit.published} onChange={e=>setEdit({...edit,published:e.target.checked})} />Показывать компанию на сайте</label>
      <Button type="submit" disabled={saving || uploading} className="w-full">{saving ? 'Сохраняем…' : uploading ? 'Дождитесь загрузки фото…' : 'Сохранить'}</Button>
      </fieldset>
    </form>}</DialogContent></Dialog>
  </section>;
}
