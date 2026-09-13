import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { createBanner, deleteBanner, fetchBannersList, fetchFoodRestaurantsList, updateBanner, type BannerPayload } from '@/lib/foodAdminApi';
import { findDamAlemRestaurantId } from '@/lib/damAlem';
import { humanizeApiError } from '@/lib/apiErrors';
import { invalidateAllCaches } from '@/lib/cache';
import { bumpFoodMenuVersion } from '@/lib/foodCartStorage';
import { parsePromoCodes, isPromoCurrent } from '@/lib/foodPromo';
import { foodBannerActionUrl, isFoodBanner, resolveFoodBannerAction, safeBannerLink, type FoodBannerAction } from '@/lib/foodBannerActions';
import { FoodBannerCard } from '@/components/damalem/DamAlemPromoBanners';
import ImageUpload from '@/components/ImageUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Copy, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import '@/styles/foodBanners.css';

interface Banner extends BannerPayload { id: number }
interface Category { id: number; name: string; slug?: string; restaurant_id?: number; is_active?: boolean }
function getactions(adminT: (key: string) => string) {
  const actions: { type: FoodBannerAction['type']; label: string }[] = [
  { type: 'menu', label: adminT("admin.ui.0260") }, { type: 'category', label: adminT("admin.ui.0261") },
  { type: 'promo', label: adminT("admin.ui.0262") }, { type: 'popular', label: adminT("admin.ui.0263") },
  { type: 'gifts', label: adminT("admin.ui.0264") }, { type: 'link', label: adminT("admin.ui.0265") },
];
  return actions;
}
const categorySlug = (c: Category) => c.slug?.trim() || c.name.toLowerCase().replace(/[^\w\u0400-\u04FF\s-]+/g, '').trim().replace(/\s+/g, '-');
const selectClass = 'w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-700';

export default function AdminDamAlemBanners() {
  const { t: adminT } = useLanguage();
  const actions = getactions(adminT);
  const foodBannerCtaLabel = (value: FoodBannerAction): string => {
    switch (value.type) {
      case 'promo': return adminT('admin.banner.applyCode').replace('{code}', () => value.code);
      case 'category': return adminT('admin.banner.chooseDishes');
      case 'popular': return adminT('admin.banner.viewPopular');
      case 'gifts': return adminT('admin.banner.viewGifts');
      case 'link': return adminT('admin.banner.details');
      default: return adminT('admin.ui.0260');
    }
  };
  const foodBannerActionDescription = (value: FoodBannerAction): string => {
    switch (value.type) {
      case 'category': return adminT('admin.banner.categoryDestination').replace('{name}', () => value.slug);
      case 'promo': return adminT('admin.banner.promoDestination').replace('{code}', () => value.code);
      case 'popular': return adminT('admin.banner.popularDestination');
      case 'gifts': return adminT('admin.banner.giftsDestination');
      case 'link': return adminT('admin.banner.linkDestination').replace('{url}', () => value.url);
      default: return adminT('admin.banner.menuDestination');
    }
  };


  const [items, setItems] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [promos, setPromos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lookupWarning, setLookupWarning] = useState('');
  const [draft, setDraft] = useState<Partial<Banner> | null>(null);
  const [action, setAction] = useState<FoodBannerAction>({ type: 'menu' });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);

  const reload = async () => {
    setLoading(true); setError('');
    try { setItems((await fetchBannersList({ limit: 2000, sort: '-id' })).filter(isFoodBanner)); }
    catch (e) { setError(humanizeApiError(e) || adminT("admin.ui.0266")); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void reload();
    let alive = true;
    Promise.all([fetchFoodRestaurantsList(), client.entities.food_categories.query({ limit: 500 }), client.entities.food_settings.query({ limit: 200 })])
      .then(([restaurants, cats, settings]) => {
        if (!alive) return;
        const id = findDamAlemRestaurantId(restaurants);
        setCategories((cats.data.items as Category[]).filter(c => c.is_active !== false && (id == null || c.restaurant_id == null || c.restaurant_id === id)));
        const raw = settings.data.items.find((s: { setting_key: string }) => s.setting_key === 'promo_codes')?.setting_value;
        setPromos(parsePromoCodes(raw).filter(p => isPromoCurrent(p)).map(p => p.code));
      }).catch(() => { if (alive) setLookupWarning(adminT("admin.ui.0267")); });
    return () => { alive = false; };
  }, []);

  const open = (banner?: Banner, duplicate = false) => {
    setFormError('');
    setDraft(banner ? { ...banner, subtitle: banner.subtitle || banner.banner_text || '', id: duplicate ? undefined : banner.id, title: duplicate ? adminT("admin.extra.1268").replace('{0}', () => String(banner.title)) : banner.title, active: duplicate ? false : banner.active } : { title: '', subtitle: '', image_url: '', button_text: '', active: false });
    setAction(banner ? resolveFoodBannerAction(banner) : { type: 'menu' });
  };
  const refreshStorefront = () => { invalidateAllCaches(); bumpFoodMenuVersion(); };
  const mutate = async (operation: () => Promise<unknown>, message: string, done?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await operation(); refreshStorefront(); toast.success(message); done?.(); await reload(); }
    catch (e) { const message = humanizeApiError(e) || adminT("admin.ui.0268"); setFormError(message); toast.error(message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const save = () => {
    if (!draft || uploading) return;
    let message = '';
    if (!draft.title?.trim()) message = adminT("admin.ui.0269");
    else if (draft.title.trim().length > 70) message = adminT("admin.ui.0270");
    else if ((draft.subtitle || '').length > 160) message = adminT("admin.ui.0271");
    else if ((draft.button_text || '').length > 40) message = adminT("admin.ui.0272");
    else if (action.type === 'category' && !categories.some(c => categorySlug(c) === action.slug)) message = adminT("admin.ui.0273");
    else if (action.type === 'promo' && !action.code.trim()) message = adminT("admin.ui.0274");
    else if (action.type === 'promo' && !/^[A-ZА-ЯЁ0-9_-]{1,40}$/i.test(action.code.trim())) message = adminT("admin.ui.0275");
    else if (action.type === 'link' && !safeBannerLink(action.url.trim())) message = adminT("admin.ui.0276");
    if (message) { setFormError(message); return; }
    setFormError('');
    const url = foodBannerActionUrl(action);
    const payload: BannerPayload = {
      title: draft.title!.trim(), subtitle: draft.subtitle?.trim() || '', banner_text: draft.subtitle?.trim() || '',
      image_url: draft.image_url || '', button_text: draft.button_text?.trim() || '', button_url: url, link_url: url,
      banner_type: 'food_delivery', active: draft.active ?? false,
    };
    void mutate(() => draft.id ? updateBanner(draft.id, payload) : createBanner({ ...payload, created_at: new Date().toISOString() }), draft.active ? adminT("admin.ui.0277") : adminT("admin.ui.0278"), () => setDraft(null));
  };
  const chooseAction = (type: FoodBannerAction['type']) => {
    setAction(type === 'category' ? { type, slug: '' } : type === 'promo' ? { type, code: '' } : type === 'link' ? { type, url: '' } : { type });
    setDraft(current => current ? { ...current, button_text: '' } : null);
  };
  const describe = (value: FoodBannerAction) => value.type === 'category' ? adminT("admin.extra.1269").replace('{0}', () => String(categories.find(c => categorySlug(c) === value.slug)?.name || value.slug)) : foodBannerActionDescription(value);
  const preview = draft ? { id: draft.id || 0, title: draft.title || adminT("admin.ui.0279"), subtitle: draft.subtitle, image_url: draft.image_url, button_text: draft.button_text, button_url: foodBannerActionUrl(action) } : null;

  return (
    <div className="space-y-6" data-testid="food-banner-admin">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#eef2e9] p-5">
        <div><h3 className="text-xl font-bold text-[#29392b]">{adminT("admin.ui.0280")}</h3><p className="mt-1 max-w-xl text-sm text-gray-600">{adminT("admin.ui.0281")}</p></div>
        <Button onClick={() => open()} className="bg-[#344b3a] hover:bg-[#253b2b] text-white"><Plus className="mr-2 h-4 w-4" />{adminT("admin.ui.0282")}</Button>
      </div>
      {lookupWarning && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{lookupWarning}</p>}
      <div className="flex flex-wrap justify-between gap-2 text-sm text-gray-600"><span>{items.filter(i => i.active === true).length} {adminT("admin.ui.0283")} {items.filter(i => i.active !== true).length} {adminT("admin.ui.0284")}</span><Link to="/food" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#344b3a] underline">{adminT("admin.ui.0254")}<ExternalLink className="h-4 w-4" /></Link></div>
      {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<Button variant="outline" className="ml-3" onClick={() => void reload()}>{adminT("admin.ui.0285")}</Button></div>
        : loading ? <div role="status" className="flex justify-center gap-2 py-8"><Loader2 className="animate-spin" />{adminT("admin.ui.0286")}</div>
          : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <article key={item.id} className="min-w-0 rounded-2xl border bg-white p-3" data-testid={`admin-banner-${item.id}`}>
            <FoodBannerCard banner={item} onAction={a => toast.info(describe(a))} />
            <p className="mt-3 text-xs text-gray-600 break-words">{describe(resolveFoodBannerAction(item))}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
              <Button variant="ghost" size="sm" disabled={busy} aria-label={adminT("admin.extra.1270").replace('{0}', () => String(item.active !== true ? adminT("admin.ui.0065") : adminT("admin.ui.0064"))).replace('{1}', () => String(item.title))} onClick={() => void mutate(() => updateBanner(item.id, { active: item.active !== true }), item.active !== true ? adminT("admin.ui.0287") : adminT("admin.ui.0288"))}>
                {item.active !== true ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}{item.active !== true ? adminT("admin.ui.0289") : adminT("admin.ui.0290")}
              </Button>
              <Button variant="ghost" size="icon" aria-label={adminT("admin.extra.1271").replace('{0}', () => String(item.title))} onClick={() => open(item)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={adminT("admin.extra.1272").replace('{0}', () => String(item.title))} onClick={() => open(item, true)}><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={adminT("admin.extra.1273").replace('{0}', () => String(item.title))} disabled={busy} onClick={() => setDeleteTarget(item)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
          </article>)}</div>}
      {!loading && !error && !items.length && <div className="rounded-2xl border border-dashed p-8 text-center"><h3 className="font-semibold">{adminT("admin.ui.0291")}</h3><p className="mt-2 text-sm text-gray-500">{adminT("admin.ui.0292")}</p></div>}

      <Dialog open={!!draft} onOpenChange={open => { if (!open && !busy && !uploading) setDraft(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? adminT("admin.ui.0115") : adminT("admin.ui.0282")}</DialogTitle><DialogDescription>{adminT("admin.ui.0293")}</DialogDescription></DialogHeader>
          {draft && preview && <form onSubmit={e => { e.preventDefault(); save(); }} className="grid gap-6 md:grid-cols-2">
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <div><label htmlFor="banner-action" className="mb-1 block text-sm font-medium">{adminT("admin.ui.0294")}</label><select id="banner-action" className={selectClass} value={action.type} onChange={e => chooseAction(e.target.value as FoodBannerAction['type'])}>{actions.map(a => <option key={a.type} value={a.type}>{a.label}</option>)}</select></div>
              {action.type === 'category' && <div><label htmlFor="banner-category" className="mb-1 block text-sm font-medium">{adminT("admin.ui.0231")}</label><select id="banner-category" className={selectClass} value={action.slug} onChange={e => setAction({ type: 'category', slug: e.target.value })}><option value="">{adminT("admin.ui.0295")}</option>{action.slug && !categories.some(c => categorySlug(c) === action.slug) && <option value={action.slug}>{action.slug} {adminT("admin.ui.0296")}</option>}{categories.map(c => <option key={c.id} value={categorySlug(c)}>{c.name}</option>)}</select></div>}
              {action.type === 'promo' && <div><label htmlFor="banner-code" className="mb-1 block text-sm font-medium">{adminT("admin.ui.0297")}</label><Input id="banner-code" list="banner-known-promos" maxLength={40} value={action.code} onChange={e => setAction({ type: 'promo', code: e.target.value.toUpperCase() })} placeholder={adminT("admin.ui.0298")} /><datalist id="banner-known-promos">{promos.map(code => <option key={code} value={code} />)}</datalist><p className="mt-1 text-xs text-gray-500">{adminT("admin.ui.0299")}</p></div>}
              {action.type === 'link' && <div><label htmlFor="banner-url" className="mb-1 block text-sm font-medium">{adminT("admin.ui.0113")}</label><Input id="banner-url" value={action.url} onChange={e => setAction({ type: 'link', url: e.target.value })} placeholder={adminT("admin.ui.0300")} /><p className="mt-1 text-xs text-gray-500">{adminT("admin.ui.0301")}</p></div>}
              <div><label htmlFor="banner-title" className="mb-1 block text-sm font-medium">{adminT("admin.ui.0302")}</label><Input id="banner-title" maxLength={70} value={draft.title || ''} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={adminT("admin.ui.0303")} /><p className="mt-1 text-xs text-gray-400">{draft.title?.length || 0}{adminT("admin.ui.0304")}</p></div>
              <div><label htmlFor="banner-subtitle" className="mb-1 block text-sm font-medium">{adminT("admin.ui.0305")}</label><Textarea id="banner-subtitle" rows={3} maxLength={160} value={draft.subtitle || ''} onChange={e => setDraft({ ...draft, subtitle: e.target.value })} placeholder={adminT("admin.ui.0306")} /></div>
              <div><label htmlFor="banner-cta" className="mb-1 block text-sm font-medium">{adminT("admin.ui.0124")}</label><Input id="banner-cta" maxLength={40} value={draft.button_text || ''} onChange={e => setDraft({ ...draft, button_text: e.target.value })} placeholder={foodBannerCtaLabel(action)} /><p className="mt-1 text-xs text-gray-500">{adminT("admin.ui.0307")}</p></div>
              <div><p className="mb-1 text-sm font-medium">{adminT("admin.ui.0308")}</p><p className="mb-2 text-xs text-gray-500">{adminT("admin.ui.0309")}</p><ImageUpload value={draft.image_url || ''} onUploadingChange={setUploading} onChange={image_url => setDraft(current => current ? { ...current, image_url } : null)} folder="banners" /></div>
            </fieldset>
            <div className="min-w-0 space-y-4"><div className="md:sticky md:top-0"><p className="mb-3 text-sm font-semibold text-gray-600">{adminT("admin.ui.0310")}</p><FoodBannerCard banner={preview} onAction={() => toast.info(describe(action))} /><p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-600 break-words">{describe(action)}</p><p className="mt-2 text-xs text-gray-500">{adminT("admin.ui.0311")}</p>
              <label className="mt-5 flex items-start gap-3 rounded-xl border p-4"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-800" checked={draft.active ?? false} disabled={busy} onChange={e => setDraft({ ...draft, active: e.target.checked })} /><span><strong className="text-sm">{adminT("admin.ui.0312")}</strong><span className="mt-1 block text-xs text-gray-500">{adminT("admin.ui.0313")}</span></span></label>
            </div></div>
            {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 md:col-span-2">{formError}</p>}
            <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-white py-3 md:col-span-2"><Button type="button" variant="outline" disabled={busy || uploading} onClick={() => setDraft(null)}>{adminT("admin.ui.0095")}</Button><Button type="submit" disabled={busy || uploading} className="bg-[#344b3a] hover:bg-[#253b2b] text-white">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{uploading ? adminT("admin.ui.0314") : draft.active ? adminT("admin.ui.0315") : adminT("admin.ui.0316")}</Button></div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}><DialogContent><DialogHeader><DialogTitle>{adminT("admin.ui.0108")}</DialogTitle><DialogDescription>«{deleteTarget?.title}{adminT("admin.ui.0317")}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleteTarget(null)}>{adminT("admin.ui.0095")}</Button><Button variant="destructive" disabled={busy} onClick={() => deleteTarget && void mutate(() => deleteBanner(deleteTarget.id), adminT("admin.ui.0318"), () => setDeleteTarget(null))}>{adminT("admin.ui.0319")}</Button></div></DialogContent></Dialog>
    </div>
  );
}
