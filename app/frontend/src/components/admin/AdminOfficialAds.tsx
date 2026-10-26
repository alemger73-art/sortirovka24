/** Admin: «Sortirovka Official» — prices, texts, Kaspi links per category, and the latest requests. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_INFO, type OfficialConfig, type OfficialRequest, officialAds, tenge } from '@/lib/officialAds';

export default function AdminOfficialAds() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<OfficialConfig | null>(null);
  const [items, setItems] = useState<OfficialRequest[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => {
    officialAds.adminSettings().then(setCfg).catch(() => toast.error('Не удалось загрузить настройки Sortirovka Official'));
    officialAds.adminRequests().then((r) => setItems(r.items)).catch(() => {});
  };
  useEffect(() => { if (open && !cfg) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const missingLinks = cfg ? cfg.categories.filter((c) => !c.kaspi_link).length : 0;

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try { setCfg(await officialAds.adminSave(cfg)); toast.success('Сохранено'); }
    catch (e: any) { toast.error(e?.message || 'Не сохранилось'); } finally { setSaving(false); }
  }
  async function act(id: number, action: 'price' | 'paid' | 'published' | 'reject', category?: string) {
    setBusy(id);
    try { const r = await officialAds.adminAction(id, action, category); toast(r.answer); setItems((list) => list.map((x) => (x.id === id ? { ...x, ...r.item } : x))); }
    catch (e: any) { toast.error(e?.message || 'Не получилось'); } finally { setBusy(null); }
  }
  const setCat = (i: number, patch: Partial<OfficialConfig['categories'][number]>) =>
    setCfg((c) => (c ? { ...c, categories: c.categories.map((x, n) => (n === i ? { ...x, ...patch } : x)) } : c));

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60" data-testid="admin-official">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 p-4 text-left">
        <BadgeCheck className="h-5 w-5 text-sky-600" />
        <span className="flex-1 font-semibold text-gray-900">Sortirovka Official — платное размещение в канале</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-sky-200 p-4">
          {!cfg ? <Loader2 className="h-5 w-5 animate-spin text-sky-600" /> : (
            <>
              {missingLinks > 0 && <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Вставьте ссылки Kaspi для оплаты (Kaspi Pay → «Ссылка на оплату»). Пока ссылки нет, бот не сможет отправить человеку счёт по этой категории.</p>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="h-4 w-4" />Принимать заявки на сайте</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="mb-1 text-xs font-medium text-gray-600">Подписчиков (как писать на сайте)</p><Input value={cfg.subscribers} onChange={(e) => setCfg({ ...cfg, subscribers: e.target.value })} /></div>
                <div><p className="mb-1 text-xs font-medium text-gray-600">Название канала</p><Input value={cfg.channel} onChange={(e) => setCfg({ ...cfg, channel: e.target.value })} /></div>
              </div>
              <div><p className="mb-1 text-xs font-medium text-gray-600">Текст вверху страницы</p><Textarea rows={3} value={cfg.intro} onChange={(e) => setCfg({ ...cfg, intro: e.target.value })} /></div>
              {cfg.categories.map((c, i) => (
                <div key={c.code} className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                    <Input aria-label="Название категории" value={c.title} onChange={(e) => setCat(i, { title: e.target.value })} />
                    <Input aria-label="Цена, тг" inputMode="numeric" value={String(c.price)} onChange={(e) => setCat(i, { price: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                  </div>
                  <Textarea aria-label="Описание" rows={2} value={c.description} onChange={(e) => setCat(i, { description: e.target.value })} />
                  <Input aria-label="Ссылка Kaspi" placeholder="https://pay.kaspi.kz/pay/…" value={c.kaspi_link || ''} onChange={(e) => setCat(i, { kaspi_link: e.target.value.trim() })} />
                </div>
              ))}
              <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Сохранить</Button>

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">Последние заявки</p>
                {items.length === 0 ? <p className="text-sm text-gray-500">Заявок пока нет. Они также приходят в Telegram с кнопками.</p> : (
                  <ul className="space-y-2">
                    {items.slice(0, 30).map((r) => {
                      const info = STATUS_INFO[r.status] || STATUS_INFO.new;
                      return (
                        <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <b>№{r.id}</b><span className="text-gray-500">{r.name} · {r.phone}</span>
                            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${info.tone}`}>{info.ru}{r.price ? ` · ${tenge(r.price)}` : ''}</span>
                          </div>
                          <p className="mt-1 line-clamp-3 whitespace-pre-line text-gray-700">{r.body}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(r.status === 'new' || r.status === 'priced') && cfg.categories.map((c) => (
                              <Button key={c.code} size="sm" variant="outline" disabled={busy === r.id} onClick={() => void act(r.id, 'price', c.code)}>{c.title} · {tenge(c.price)}</Button>
                            ))}
                            {r.status === 'priced' && <Button size="sm" disabled={busy === r.id} onClick={() => void act(r.id, 'paid')}>💰 Оплачено</Button>}
                            {r.status === 'paid' && <Button size="sm" disabled={busy === r.id} onClick={() => void act(r.id, 'published')}>📣 Опубликовано</Button>}
                            {(r.status === 'new' || r.status === 'priced') && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void act(r.id, 'reject')}>Отклонить</Button>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
