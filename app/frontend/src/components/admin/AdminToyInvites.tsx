/** Admin: «Шақыру» invitations — price, Kaspi link and orders with «Оплачено». */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KIND_INFO, tenge, toyApi, type ToyInvite } from '@/lib/toyInvites';

const STATUS: Record<string, string> = { draft: 'Черновик', pending: 'Ждёт оплату', published: 'Опубликовано', rejected: 'Отклонено', archived: 'Удалено' };

export default function AdminToyInvites() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<{ enabled: boolean; price: number; kaspi_link: string } | null>(null);
  const [items, setItems] = useState<(ToyInvite & { phone?: string })[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || cfg) return;
    toyApi.adminSettings().then(setCfg).catch(() => toast.error('Не удалось загрузить настройки приглашений'));
    toyApi.adminList().then((r) => setItems(r.items)).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try { setCfg(await toyApi.adminSave(cfg)); toast.success('Сохранено'); } catch (e: any) { toast.error(e?.message || 'Не сохранилось'); } finally { setSaving(false); }
  }
  async function act(id: number, action: 'paid' | 'reject') {
    setBusy(id);
    try { const r = await toyApi.adminAction(id, action); toast(r.answer); setItems((l) => l.map((x) => (x.id === id ? { ...x, ...r.item } : x))); }
    catch (e: any) { toast.error(e?.message || 'Не получилось'); } finally { setBusy(null); }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60" data-testid="admin-toy">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 p-4 text-left">
        <Mail className="h-5 w-5 text-violet-600" />
        <span className="flex-1 font-semibold text-gray-900">Шақыру — приглашения на той</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-violet-200 p-4">
          {!cfg ? <Loader2 className="h-5 w-5 animate-spin" /> : <>
            {!cfg.kaspi_link && <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Вставьте ссылку Kaspi на оплату. Пока её нет, клиенту придёт сообщение «ссылку пришлём отдельно».</p>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="h-4 w-4" />Принимать заказы</label>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div><p className="mb-1 text-xs font-medium text-gray-600">Цена, ₸</p><Input inputMode="numeric" value={String(cfg.price)} onChange={(e) => setCfg({ ...cfg, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></div>
              <div><p className="mb-1 text-xs font-medium text-gray-600">Ссылка Kaspi</p><Input placeholder="https://pay.kaspi.kz/pay/…" value={cfg.kaspi_link} onChange={(e) => setCfg({ ...cfg, kaspi_link: e.target.value.trim() })} /></div>
            </div>
            <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Сохранить</Button>
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900">Заказы</p>
              {items.length === 0 ? <p className="text-sm text-gray-500">Пока нет. Новые заказы также приходят в Telegram с кнопкой «Оплачено».</p> : (
                <ul className="space-y-2">
                  {items.slice(0, 40).map((inv) => (
                    <li key={inv.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>№{inv.id}</b><span>{KIND_INFO[inv.data.kind]?.title.ru}</span>
                        <span className="text-gray-500">{[inv.data.name1, inv.data.name2].filter(Boolean).join(' и ')} · {inv.data.date} · {inv.phone}</span>
                        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">{STATUS[inv.status] || inv.status}{inv.price ? ` · ${tenge(inv.price)}` : ''}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a className="text-sm text-violet-700 underline" href={inv.link} target="_blank" rel="noreferrer">Открыть</a>
                        {inv.status === 'pending' && <>
                          <Button size="sm" disabled={busy === inv.id} onClick={() => void act(inv.id, 'paid')}>💰 Оплачено</Button>
                          <Button size="sm" variant="ghost" disabled={busy === inv.id} onClick={() => void act(inv.id, 'reject')}>Отклонить</Button>
                        </>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
