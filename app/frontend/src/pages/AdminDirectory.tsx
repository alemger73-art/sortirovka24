import { adminMetadataLabel } from '@/i18n/adminTranslations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { client, withRetry, DIRECTORY_CATEGORIES, sortDirectoryEntries } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { type DirectoryEntry, isLegacyDemo, isNationalEmergency, phoneLink, httpsLink, whatsappLink, matchesEntry, readyForDirectory } from '@/lib/directoryContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const categories = [...DIRECTORY_CATEGORIES, 'Государственные услуги', 'Социальная помощь', 'Прочее'];
const labelStyle = 'grid gap-1.5 text-sm font-medium';
export default function AdminDirectory() {
  const { t: adminT } = useLanguage();

  const [items, setItems] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(false);
  const [edit, setEdit] = useState<Partial<DirectoryEntry> | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const generation = useRef(0);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  async function load() {
    const version = ++generation.current; setLoading(true); setLoadError(false);
    try {
      const all: DirectoryEntry[] = [];
      for (let skip = 0; ; skip += 200) {
        const res = await withRetry(() => client.entities.directory_entries.query({ sort: 'id', skip, limit: 200 }));
        const page = res.data?.items || []; all.push(...page);
        if (page.length < 200 || all.length >= (res.data?.total ?? Infinity)) break;
      }
      if (version === generation.current) setItems(sortDirectoryEntries(all));
    } catch { if (version === generation.current) setLoadError(true); }
    finally { if (version === generation.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  const patch = (key: keyof DirectoryEntry, value: string | boolean | number) => setEdit(previous => previous ? { ...previous, [key]: value } : previous);
  function open(item?: DirectoryEntry) { setError(''); setEdit(item ? { ...item } : { entry_name: '', category: 'Коммунальные службы', is_published: false, sort_order: 0 }); }
  async function save() {
    if (!edit || lock.current) return;
    setError('');
    if (!edit.entry_name?.trim() || !edit.category?.trim()) return setError(adminT("admin.ui.0422"));
    for (const field of ['website', 'map_url', 'source_url'] as const) if (edit[field] && !httpsLink(edit[field])) return setError(adminT("admin.ui.0423"));
    if (edit.phone && !phoneLink(edit.phone)) return setError(adminT("admin.ui.0424"));
    if (edit.whatsapp && !whatsappLink(edit.whatsapp)) return setError(adminT("admin.ui.0425"));
    if (edit.verified_at && (!/^\d{4}-\d{2}-\d{2}$/.test(edit.verified_at) || edit.verified_at > new Date().toLocaleDateString('sv-SE'))) return setError(adminT("admin.ui.0426"));
    if (edit.is_published !== false && (!edit.source_url || !edit.verified_at || (!edit.phone && !edit.website))) return setError(adminT("admin.ui.0427"));
    if (edit.is_published !== false && (isLegacyDemo(edit as DirectoryEntry) || isNationalEmergency(edit as DirectoryEntry))) return setError(adminT("admin.ui.0428"));
    const { id, ...data } = edit;
    lock.current = true; setBusy(true);
    try {
      const cleaned = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      if (id) await client.entities.directory_entries.update({ id: String(id), data: cleaned });
      else await client.entities.directory_entries.create({ data: cleaned });
      invalidateAllCaches(); setEdit(null); setNotice(data.is_published === false ? adminT("admin.ui.0429") : adminT("admin.ui.0430")); await load();
    } catch { setError(adminT("admin.ui.0431")); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove(item: DirectoryEntry) {
    if (lock.current || !confirm(adminT("admin.extra.1276").replace('{0}', () => String(item.entry_name)))) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await client.entities.directory_entries.delete({ id: String(item.id) }); invalidateAllCaches(); setNotice(adminT("admin.ui.0432")); await load(); }
    catch { setNotice(adminT("admin.ui.0433")); }
    finally { lock.current = false; setBusy(false); }
  }
  const visible = items.filter(e => matchesEntry(e, search) && (status === 'all' || (status === 'draft' ? e.is_published === false : status === 'review' ? !readyForDirectory(e) && e.is_published !== false : readyForDirectory(e))));
  return <div className="space-y-5">
    <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 p-4 space-y-2"><h2 className="font-bold text-lg">{adminT("admin.ui.0434")}</h2><p className="text-sm text-slate-600 dark:text-slate-300">{adminT("admin.ui.0435")}</p><p className="text-sm">{adminT("admin.ui.0436")}</p><Link to="/directory" className="inline-block py-2 text-teal-700 dark:text-teal-300 underline">{adminT("admin.ui.0437")}</Link></div>
    <div className="flex flex-wrap items-end gap-3"><label className={`${labelStyle} flex-1 min-w-[180px]`}>{adminT("admin.ui.0438")}<Input value={search} onChange={e => setSearch(e.target.value)} placeholder={adminT("admin.ui.0439")} /></label><label className={labelStyle}>{adminT("admin.ui.0065")}<select className="h-10 rounded-md border bg-background px-3" value={status} onChange={e => setStatus(e.target.value)}><option value="all">{adminT("admin.ui.0440")}</option><option value="published">{adminT("admin.ui.0059")}</option><option value="draft">{adminT("admin.ui.0441")}</option><option value="review">{adminT("admin.ui.0442")}</option></select></label><Button disabled={busy || loading || loadError} onClick={() => open()}><Plus size={16} className="mr-2" />{adminT("admin.ui.0062")}</Button></div>
    {notice && <p role="status" className="rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-sm">{notice}</p>}
    {loading ? <p role="status">{adminT("admin.ui.0443")}</p> : loadError ? <div role="alert" className="rounded-lg border border-red-200 p-4">{adminT("admin.ui.0444")} <Button variant="outline" onClick={() => void load()}>{adminT("admin.ui.0445")}</Button></div> : <><p className="text-sm text-slate-500">{adminT("admin.ui.0446")} {visible.length} {adminT("admin.ui.0447")} {items.length}</p>{!visible.length && <p className="p-6 text-center">{adminT("admin.ui.0448")}</p>}{visible.map(item => <article key={item.id} className="rounded-xl border p-4 flex items-start gap-3">
      <div className="min-w-0 flex-1 break-words"><div className="text-xs text-slate-500 mb-1">{item.category || adminT("admin.ui.0420")} · {item.is_published === false ? adminT("admin.ui.0289") : readyForDirectory(item) ? adminT("admin.ui.0041") : adminT("admin.ui.0449")}</div><h3 className="font-semibold">{item.entry_name || adminT("admin.ui.0450")}</h3><p className="text-sm mt-1">{item.phone || adminT("admin.ui.0451")}{item.address && ` · ${item.address}`}</p>{isLegacyDemo(item) ? <p className="text-sm text-amber-700 mt-2">{adminT("admin.ui.0452")}</p> : isNationalEmergency(item) ? <p className="text-sm text-amber-700 mt-2">{adminT("admin.ui.0453")}</p> : (!item.source_url || !item.verified_at) && <p className="text-sm text-amber-700 mt-2">{adminT("admin.ui.0454")}</p>}</div>
      <div className="flex flex-col sm:flex-row gap-1"><Button variant="outline" size="icon" disabled={busy} aria-label={adminT("admin.extra.1277").replace('{0}', () => String(item.entry_name))} onClick={() => open(item)}><Pencil size={16} /></Button><Button variant="outline" size="icon" disabled={busy} aria-label={adminT("admin.extra.1278").replace('{0}', () => String(item.entry_name))} onClick={() => void remove(item)}><Trash2 size={16} /></Button></div>
    </article>)}</>}
    <Dialog open={!!edit} onOpenChange={value => { if (!value && !lock.current) setEdit(null); }}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{edit?.id ? adminT("admin.ui.0455") : adminT("admin.ui.0456")}</DialogTitle><DialogDescription>{adminT("admin.ui.0457")}</DialogDescription></DialogHeader>{edit && <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className="space-y-4">
        <label className={labelStyle}>{adminT("admin.ui.0458")}<Input maxLength={200} value={edit.entry_name || ''} onChange={e => patch('entry_name', e.target.value)} /></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className={labelStyle}>{adminT("admin.ui.0459")}<Input list="directory-admin-categories" maxLength={200} value={edit.category || ''} onChange={e => patch('category', e.target.value)} /><datalist id="directory-admin-categories">{categories.map(c => <option key={c} value={c} label={adminMetadataLabel(c, adminT)} />)}</datalist></label><label className={labelStyle}>{adminT("admin.ui.0460")}<Input type="number" min={0} max={100000} value={edit.sort_order ?? 0} onChange={e => patch('sort_order', Number(e.target.value))} /></label></div>
        <label className={labelStyle}>{adminT("admin.ui.0461")}<Textarea maxLength={4000} rows={3} value={edit.description || ''} onChange={e => patch('description', e.target.value)} placeholder={adminT("admin.ui.0462")} /></label>
        <label className={labelStyle}>{adminT("admin.ui.0082")}<Input maxLength={4000} value={edit.address || ''} onChange={e => patch('address', e.target.value)} placeholder={adminT("admin.ui.0463")} /></label>
        <label className={labelStyle}>{adminT("admin.ui.0464")}<Textarea maxLength={4000} rows={2} value={edit.opening_hours || ''} onChange={e => patch('opening_hours', e.target.value)} placeholder={adminT("admin.ui.0465")} /></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className={labelStyle}>{adminT("admin.ui.0466")}<Input type="tel" value={edit.phone || ''} onChange={e => patch('phone', e.target.value)} placeholder={adminT("admin.ui.0467")} /></label><label className={labelStyle}>WhatsApp<Input type="tel" value={edit.whatsapp || ''} onChange={e => patch('whatsapp', e.target.value)} placeholder={adminT("admin.ui.0468")} /></label></div>
        {([['website', adminT("admin.ui.0469")], ['map_url', adminT("admin.ui.0470")], ['source_url', adminT("admin.ui.0471")]] as const).map(([key, title]) => <label key={key} className={labelStyle}>{title}<Input maxLength={2000} value={edit[key] || ''} onChange={e => patch(key, e.target.value)} placeholder="https://…" /></label>)}
        <p className="text-xs text-slate-500">{adminT("admin.ui.0472")}</p>
        <label className={labelStyle}>{adminT("admin.ui.0473")}<Input type="date" max={new Date().toLocaleDateString('sv-SE')} value={edit.verified_at || ''} onChange={e => patch('verified_at', e.target.value)} /></label>
        <label className="flex items-start gap-3 p-3 rounded-lg border text-sm"><input className="mt-1" type="checkbox" checked={edit.is_published !== false} onChange={e => patch('is_published', e.target.checked)} /><span>{adminT("admin.ui.0474")}<br /><small className="text-slate-500">{adminT("admin.ui.0475")}</small></span></label>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setEdit(null)}>{adminT("admin.ui.0095")}</Button><Button type="submit">{busy ? adminT("admin.ui.0476") : edit.is_published === false ? adminT("admin.ui.0316") : adminT("admin.ui.0477")}</Button></div>
      </fieldset>
    </form>}</DialogContent></Dialog>
  </div>;
}
