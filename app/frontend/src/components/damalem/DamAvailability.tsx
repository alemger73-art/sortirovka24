import {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2, RefreshCw, Search} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLanguage} from '@/contexts/LanguageContext';
import {foodBusiness} from '@/lib/foodOperations';
import {invalidateAllCaches} from '@/lib/cache';

interface Item {id: number; name: string; available: boolean; category_id?: number | null; category_name?: string | null}
type StockFilter = 'all' | 'available' | 'stopped';

export default function DamAvailability() {
  const {t} = useLanguage();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const pending = useRef(false), generation = useRef(0), mounted = useRef(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    const current = ++generation.current;
    try {
      const rows = await foodBusiness<Item[]>('/availability');
      if (mounted.current && current === generation.current) { setItems(rows); setError(''); }
    } catch (e) {
      if (mounted.current && current === generation.current) setError((e as Error).message);
    } finally { if (mounted.current && current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = window.setInterval(() => {if (!document.hidden) void load();}, 15000);
    return () => {mounted.current = false; generation.current++; clearInterval(timer);};
  }, [load]);

  async function toggle(item: Item) {
    if (pending.current) return;
    pending.current = true; generation.current++;
    setBusyId(item.id); setError('');
    const available = !item.available;
    try {
      await foodBusiness(`/availability/${item.id}`, 'PATCH', {available});
      invalidateAllCaches();
      if (!mounted.current) return;
      // Show committed changes only. Failed writes preserve the previous state.
      setItems(rows => rows.map(row => row.id === item.id ? {...row, available} : row));
      toast.success(t(available ? 'dam.stock.restored' : 'dam.stock.stoppedNotice').replace('{name}', item.name), {duration: 3000});
    } catch (e) {
      if (mounted.current) {setError((e as Error).message); toast.error((e as Error).message, {duration: 4500});}
    } finally {pending.current = false; if (mounted.current) {setBusyId(null); setLoading(false);}}
  }

  const categories = [...new Map(items.filter(i => i.category_id != null && i.category_name).map(i => [String(i.category_id), i.category_name!])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
  const matching = items.filter(i => (i.name || '').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (!category || String(i.category_id) === category));
  const counts = {all: matching.length, available: matching.filter(i => i.available).length, stopped: matching.filter(i => !i.available).length};
  const visible = matching.filter(i => filter === 'all' || (filter === 'available' ? i.available : !i.available)).sort((a,b) => Number(a.available) - Number(b.available) || a.name.localeCompare(b.name));

  return <section aria-label={t('dam.stock.title')} className="space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-xl font-semibold">{t('dam.stock.title')}</h3><p className="mt-1 text-sm text-muted-foreground">{t('dam.stock.help')}</p></div>
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" disabled={busyId !== null} title={t('dam.stock.refresh')} aria-label={t('dam.stock.refresh')} onClick={() => void load()}><RefreshCw className="h-4 w-4"/></Button>
    </div>
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(160px,240px)]">
      <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/><Input className="h-11 pl-9" aria-label={t('dam.stock.search')} placeholder={t('dam.stock.search')} value={search} onChange={e => setSearch(e.target.value)}/></div>
      <select aria-label={t('dam.stock.category')} className="h-11 min-w-0 rounded-md border bg-background px-3 text-sm" value={category} onChange={e => setCategory(e.target.value)}><option value="">{t('dam.stock.categoriesAll')}</option>{categories.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select>
    </div>
    <div aria-label={t('dam.stock.filter')} role="group" className="flex flex-wrap gap-1.5">{(['all','available','stopped'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition ${filter === value ? 'border-foreground bg-foreground text-background' : 'border-transparent bg-muted/70 hover:bg-muted'}`}><span>{t(`dam.stock.${value}`)}</span><span className="text-xs tabular-nums opacity-75">{counts[value]}</span></button>)}</div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
    {loading ? <p role="status" className="py-6 text-sm text-muted-foreground">{t('dam.stock.loading')}</p> : <>
      <div data-testid="availability-list" className="grid gap-2 lg:grid-cols-2">{visible.map(item => <article data-testid={`availability-${item.id}`} key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
        <div className="min-w-0 flex-1"><h4 className="break-words text-sm font-medium leading-5">{item.name}</h4><p className={`mt-1 flex items-center gap-1.5 text-xs ${item.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.available ? 'bg-emerald-500' : 'bg-red-500'}`}/>{t(item.available ? 'dam.stock.available' : 'dam.stock.stopped')}</p></div>
        <Button variant="outline" className={`h-11 min-w-20 shrink-0 px-3 ${!item.available ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950' : ''}`} disabled={busyId !== null} onClick={() => void toggle(item)}>{busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('dam.stock.saving')}/> : t(item.available ? 'dam.stock.stop' : 'dam.stock.restore')}</Button>
      </article>)}</div>
      {!visible.length && <p role="status" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t(items.length ? 'dam.stock.noMatches' : 'dam.stock.empty')}</p>}
    </>}
  </section>;
}
