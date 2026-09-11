import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { createBanner, deleteBanner, fetchBannersList, fetchFoodRestaurantsList, updateBanner, type BannerPayload } from '@/lib/foodAdminApi';
import { findDamAlemRestaurantId } from '@/lib/damAlem';
import { humanizeApiError } from '@/lib/apiErrors';
import { invalidateAllCaches } from '@/lib/cache';
import { bumpFoodMenuVersion } from '@/lib/foodCartStorage';
import { parsePromoCodes, isPromoCurrent } from '@/lib/foodPromo';
import { foodBannerActionDescription, foodBannerActionUrl, foodBannerCtaLabel, isFoodBanner, resolveFoodBannerAction, safeBannerLink, type FoodBannerAction } from '@/lib/foodBannerActions';
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
const actions: { type: FoodBannerAction['type']; label: string }[] = [
  { type: 'menu', label: 'Открыть меню' }, { type: 'category', label: 'Открыть категорию блюд' },
  { type: 'promo', label: 'Применить промокод' }, { type: 'popular', label: 'Показать хиты меню' },
  { type: 'gifts', label: 'Показать подарки' }, { type: 'link', label: 'Открыть ссылку' },
];
const categorySlug = (c: Category) => c.slug?.trim() || c.name.toLowerCase().replace(/[^\w\u0400-\u04FF\s-]+/g, '').trim().replace(/\s+/g, '-');
const selectClass = 'w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-700';

export default function AdminDamAlemBanners() {
  const [items, setItems] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [promos, setPromos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lookupWarning, setLookupWarning] = useState('');
  const [draft, setDraft] = useState<Partial<Banner> | null>(null);
  const [action, setAction] = useState<FoodBannerAction>({ type: 'menu' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);

  const reload = async () => {
    setLoading(true); setError('');
    try { setItems((await fetchBannersList({ limit: 2000, sort: '-id' })).filter(isFoodBanner)); }
    catch (e) { setError(humanizeApiError(e) || 'Не удалось загрузить баннеры'); }
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
      }).catch(() => { if (alive) setLookupWarning('Категории и промокоды не загрузились. Обновите страницу, чтобы выбрать их из списка.'); });
    return () => { alive = false; };
  }, []);

  const open = (banner?: Banner, duplicate = false) => {
    setFormError('');
    setDraft(banner ? { ...banner, subtitle: banner.subtitle || banner.banner_text || '', id: duplicate ? undefined : banner.id, title: duplicate ? `${banner.title} — копия` : banner.title, active: duplicate ? false : banner.active } : { title: '', subtitle: '', image_url: '', button_text: '', active: false });
    setAction(banner ? resolveFoodBannerAction(banner) : { type: 'menu' });
  };
  const refreshStorefront = () => { invalidateAllCaches(); bumpFoodMenuVersion(); };
  const mutate = async (operation: () => Promise<unknown>, message: string, done?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await operation(); refreshStorefront(); toast.success(message); done?.(); await reload(); }
    catch (e) { const message = humanizeApiError(e) || 'Не удалось сохранить'; setFormError(message); toast.error(message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const save = () => {
    if (!draft) return;
    let message = '';
    if (!draft.title?.trim()) message = 'Введите заголовок баннера.';
    else if (draft.title.trim().length > 70) message = 'Заголовок должен быть не длиннее 70 символов.';
    else if ((draft.subtitle || '').length > 160) message = 'Подзаголовок должен быть не длиннее 160 символов.';
    else if ((draft.button_text || '').length > 40) message = 'Текст кнопки должен быть не длиннее 40 символов.';
    else if (action.type === 'category' && !categories.some(c => categorySlug(c) === action.slug)) message = 'Выберите доступную категорию.';
    else if (action.type === 'promo' && !action.code.trim()) message = 'Выберите или введите промокод.';
    else if (action.type === 'promo' && !/^[A-ZА-ЯЁ0-9_-]{1,40}$/i.test(action.code.trim())) message = 'Промокод: до 40 букв, цифр, дефисов или подчёркиваний.';
    else if (action.type === 'link' && !safeBannerLink(action.url.trim())) message = 'Укажите ссылку https://… или путь внутри сайта, например /food.';
    if (message) { setFormError(message); return; }
    setFormError('');
    const url = foodBannerActionUrl(action);
    const payload: BannerPayload = {
      title: draft.title!.trim(), subtitle: draft.subtitle?.trim() || '', banner_text: draft.subtitle?.trim() || '',
      image_url: draft.image_url || '', button_text: draft.button_text?.trim() || '', button_url: url, link_url: url,
      banner_type: 'food_delivery', active: draft.active ?? false,
    };
    void mutate(() => draft.id ? updateBanner(draft.id, payload) : createBanner({ ...payload, created_at: new Date().toISOString() }), draft.active ? 'Баннер сохранён и показывается на витрине' : 'Черновик сохранён', () => setDraft(null));
  };
  const chooseAction = (type: FoodBannerAction['type']) => {
    setAction(type === 'category' ? { type, slug: '' } : type === 'promo' ? { type, code: '' } : type === 'link' ? { type, url: '' } : { type });
    setDraft(current => current ? { ...current, button_text: '' } : null);
  };
  const preview = draft ? { id: draft.id || 0, title: draft.title || 'Здесь будет ваш заголовок', subtitle: draft.subtitle, image_url: draft.image_url, button_text: draft.button_text, button_url: foodBannerActionUrl(action) } : null;

  return (
    <div className="space-y-6" data-testid="food-banner-admin">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#eef2e9] p-5">
        <div><h3 className="text-xl font-bold text-[#29392b]">Предложения на витрине</h3><p className="mt-1 max-w-xl text-sm text-gray-600">Один баннер — одно понятное действие. Новые предложения появляются первыми.</p></div>
        <Button onClick={() => open()} className="bg-[#344b3a] hover:bg-[#253b2b]"><Plus className="mr-2 h-4 w-4" />Создать баннер</Button>
      </div>
      {lookupWarning && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{lookupWarning}</p>}
      <div className="flex flex-wrap justify-between gap-2 text-sm text-gray-600"><span>{items.filter(i => i.active !== false).length} на витрине · {items.filter(i => i.active === false).length} черновиков</span><Link to="/food" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#344b3a] underline">Открыть витрину<ExternalLink className="h-4 w-4" /></Link></div>
      {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<Button variant="outline" className="ml-3" onClick={() => void reload()}>Повторить загрузку</Button></div>
        : loading ? <div role="status" className="flex justify-center gap-2 py-8"><Loader2 className="animate-spin" />Загружаем баннеры…</div>
          : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <article key={item.id} className="min-w-0 rounded-2xl border bg-white p-3" data-testid={`admin-banner-${item.id}`}>
            <FoodBannerCard banner={item} onAction={a => toast.info(foodBannerActionDescription(a))} />
            <p className="mt-3 text-xs text-gray-600 break-words">{foodBannerActionDescription(resolveFoodBannerAction(item))}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
              <Button variant="ghost" size="sm" disabled={busy} aria-label={`${item.active === false ? 'Показать' : 'Скрыть'} баннер ${item.title}`} onClick={() => void mutate(() => updateBanner(item.id, { active: item.active === false }), item.active === false ? 'Баннер опубликован' : 'Баннер скрыт')}>
                {item.active === false ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}{item.active === false ? 'Черновик' : 'На витрине'}
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Редактировать ${item.title}`} onClick={() => open(item)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={`Копировать ${item.title}`} onClick={() => open(item, true)}><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={`Удалить ${item.title}`} disabled={busy} onClick={() => setDeleteTarget(item)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
          </article>)}</div>}
      {!loading && !error && !items.length && <div className="rounded-2xl border border-dashed p-8 text-center"><h3 className="font-semibold">Первое предложение начинается здесь</h3><p className="mt-2 text-sm text-gray-500">Добавьте заголовок, фото и действие. Проверьте предпросмотр и включите показ на витрине.</p></div>}

      <Dialog open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? 'Редактировать баннер' : 'Создать баннер'}</DialogTitle><DialogDescription>Сначала выберите действие, затем оформите предложение. Баннер не создаёт скидку: промокод настраивается отдельно.</DialogDescription></DialogHeader>
          {draft && preview && <form onSubmit={e => { e.preventDefault(); save(); }} className="grid gap-6 md:grid-cols-2">
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <div><label htmlFor="banner-action" className="mb-1 block text-sm font-medium">Что произойдёт при нажатии</label><select id="banner-action" className={selectClass} value={action.type} onChange={e => chooseAction(e.target.value as FoodBannerAction['type'])}>{actions.map(a => <option key={a.type} value={a.type}>{a.label}</option>)}</select></div>
              {action.type === 'category' && <div><label htmlFor="banner-category" className="mb-1 block text-sm font-medium">Категория</label><select id="banner-category" className={selectClass} value={action.slug} onChange={e => setAction({ type: 'category', slug: e.target.value })}><option value="">Выберите категорию</option>{action.slug && !categories.some(c => categorySlug(c) === action.slug) && <option value={action.slug}>{action.slug} — недоступна</option>}{categories.map(c => <option key={c.id} value={categorySlug(c)}>{c.name}</option>)}</select></div>}
              {action.type === 'promo' && <div><label htmlFor="banner-code" className="mb-1 block text-sm font-medium">Промокод</label><Input id="banner-code" list="banner-known-promos" maxLength={40} value={action.code} onChange={e => setAction({ type: 'promo', code: e.target.value.toUpperCase() })} placeholder="Выберите или введите код" /><datalist id="banner-known-promos">{promos.map(code => <option key={code} value={code} />)}</datalist><p className="mt-1 text-xs text-gray-500">Код должен быть включён в настройках Алем Фуд. Сумма и срок действия проверяются сервером.</p></div>}
              {action.type === 'link' && <div><label htmlFor="banner-url" className="mb-1 block text-sm font-medium">Ссылка</label><Input id="banner-url" value={action.url} onChange={e => setAction({ type: 'link', url: e.target.value })} placeholder="https://… или /food" /><p className="mt-1 text-xs text-gray-500">Внешний сайт откроется в новой вкладке.</p></div>}
              <div><label htmlFor="banner-title" className="mb-1 block text-sm font-medium">Заголовок</label><Input id="banner-title" maxLength={70} value={draft.title || ''} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Например: Пицца для вашего вечера" /><p className="mt-1 text-xs text-gray-400">{draft.title?.length || 0}/70 · одна короткая мысль</p></div>
              <div><label htmlFor="banner-subtitle" className="mb-1 block text-sm font-medium">Подзаголовок и условия</label><Textarea id="banner-subtitle" rows={3} maxLength={160} value={draft.subtitle || ''} onChange={e => setDraft({ ...draft, subtitle: e.target.value })} placeholder="Что получает покупатель и при каких условиях" /></div>
              <div><label htmlFor="banner-cta" className="mb-1 block text-sm font-medium">Текст кнопки</label><Input id="banner-cta" maxLength={40} value={draft.button_text || ''} onChange={e => setDraft({ ...draft, button_text: e.target.value })} placeholder={foodBannerCtaLabel(action)} /><p className="mt-1 text-xs text-gray-500">Можно оставить пустым — текст подберётся по действию.</p></div>
              <div><p className="mb-1 text-sm font-medium">Фото для баннера</p><p className="mb-2 text-xs text-gray-500">1200 × 900 px, JPG, PNG или WebP. Еда — вверху или справа, текст добавится автоматически. Без фото останется фирменный фон.</p><ImageUpload value={draft.image_url || ''} onChange={image_url => setDraft({ ...draft, image_url })} folder="banners" /></div>
            </fieldset>
            <div className="min-w-0 space-y-4"><div className="md:sticky md:top-0"><p className="mb-3 text-sm font-semibold text-gray-600">Так увидит покупатель</p><FoodBannerCard banner={preview} onAction={() => toast.info(foodBannerActionDescription(action))} /><p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-600 break-words">{foodBannerActionDescription(action)}</p><p className="mt-2 text-xs text-gray-500">Нажмите на предпросмотр, чтобы проверить назначение.</p>
              <label className="mt-5 flex items-start gap-3 rounded-xl border p-4"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-800" checked={draft.active ?? false} disabled={busy} onChange={e => setDraft({ ...draft, active: e.target.checked })} /><span><strong className="text-sm">Показывать на витрине</strong><span className="mt-1 block text-xs text-gray-500">Выключено — сохранится черновик, видимый только в админке.</span></span></label>
            </div></div>
            {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 md:col-span-2">{formError}</p>}
            <div className="flex justify-end gap-2 border-t pt-4 md:col-span-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Отмена</Button><Button type="submit" disabled={busy} className="bg-[#344b3a] hover:bg-[#253b2b]">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{draft.active ? 'Сохранить и показать' : 'Сохранить черновик'}</Button></div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Удалить баннер?</DialogTitle><DialogDescription>«{deleteTarget?.title}» будет удалён. Если планируете использовать его снова, скройте его с витрины вместо удаления.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleteTarget(null)}>Отмена</Button><Button variant="destructive" disabled={busy} onClick={() => deleteTarget && void mutate(() => deleteBanner(deleteTarget.id), 'Баннер удалён', () => setDeleteTarget(null))}>Удалить баннер</Button></div></DialogContent></Dialog>
    </div>
  );
}
