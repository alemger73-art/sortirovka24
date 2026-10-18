import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { businessPartnerApi, type BusinessPartnerRequest, type PartnerTimelineItem } from '@/lib/businessPartnerApi';
import { invalidateAllCaches } from '@/lib/cache';
import { formatDate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarClock, Loader2, Phone, MessageCircle, RefreshCw, StickyNote, Copy } from 'lucide-react';
import { toast } from 'sonner';

// Partner-lead CRM: pipeline stages, notes, next contact and the full history of each lead.
const STAGES: { id: string; ru: string; kz: string; color: string }[] = [
  { id: 'new', ru: 'Новые', kz: 'Жаңа', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'in_progress', ru: 'В работе', kz: 'Жұмыста', color: 'bg-blue-100 text-blue-800' },
  { id: 'negotiation', ru: 'Переговоры', kz: 'Келіссөз', color: 'bg-violet-100 text-violet-800' },
  { id: 'done', ru: 'Партнёры', kz: 'Серіктестер', color: 'bg-green-100 text-green-800' },
  { id: 'rejected', ru: 'Отказ', kz: 'Бас тарту', color: 'bg-red-100 text-red-800' },
];
const STAGE = Object.fromEntries(STAGES.map((s) => [s.id, s]));
const today = () => new Date().toLocaleDateString('sv-SE');

function waLink(phone?: string | null) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

export default function AdminBusinessPartners() {
  const { lang } = useLanguage();
  const L = (ru: string, kz: string) => (lang === 'kz' ? kz : ru);
  const stageName = (id?: string | null) => (STAGE[id || 'new'] ? L(STAGE[id || 'new'].ru, STAGE[id || 'new'].kz) : id || '');

  const [items, setItems] = useState<BusinessPartnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('new');
  const [view, setView] = useState<BusinessPartnerRequest | null>(null);
  const [timeline, setTimeline] = useState<PartnerTimelineItem[]>([]);
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await businessPartnerApi.list('all');
      setItems(res.items || []);
    } catch {
      toast.error(L('Не удалось загрузить заявки', 'Өтінімдер жүктелмеді'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 30_000);
    return () => clearInterval(id);
  }, [fetchItems]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, due: 0 };
    for (const i of items) {
      const s = i.status || 'new';
      c[s] = (c[s] || 0) + 1;
      if (i.next_contact && i.next_contact <= today() && ['new', 'in_progress', 'negotiation'].includes(s)) c.due += 1;
    }
    return c;
  }, [items]);

  const visible = useMemo(() => items.filter((i) => {
    const s = i.status || 'new';
    if (filter === 'all') return true;
    if (filter === 'due') return !!i.next_contact && i.next_contact <= today() && ['new', 'in_progress', 'negotiation'].includes(s);
    return s === filter;
  }), [items, filter]);

  const open = async (item: BusinessPartnerRequest) => {
    setView(item);
    setNote('');
    setNextDate(item.next_contact || '');
    setTimeline([]);
    try {
      setTimeline(await businessPartnerApi.timeline(item.id));
    } catch {
      /* the card still works without history */
    }
  };

  const refreshView = async (id: number, patch: Partial<BusinessPartnerRequest>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setView((v) => (v && v.id === id ? { ...v, ...patch } : v));
    try { setTimeline(await businessPartnerApi.timeline(id)); } catch { /* ignore */ }
    invalidateAllCaches();
  };

  const changeStage = async (id: number, status: string) => {
    setBusy(true);
    try {
      await businessPartnerApi.updateStatus(id, status);
      toast.success(L('Этап изменён', 'Кезең өзгертілді'));
      await refreshView(id, { status });
    } catch {
      toast.error(L('Не удалось изменить этап', 'Кезең өзгермеді'));
    } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!view || !note.trim()) return;
    setBusy(true);
    try {
      await businessPartnerApi.addNote(view.id, note.trim());
      const text = note.trim();
      setNote('');
      await refreshView(view.id, { last_note: text });
    } catch {
      toast.error(L('Заметка не сохранилась', 'Жазба сақталмады'));
    } finally { setBusy(false); }
  };

  const saveNextContact = async (value: string | null) => {
    if (!view) return;
    setBusy(true);
    try {
      await businessPartnerApi.setNextContact(view.id, value);
      setNextDate(value || '');
      toast.success(value ? L('Напомню в этот день в Telegram', 'Осы күні Telegram-да еске саламын') : L('Дата снята', 'Күн алынды'));
      await refreshView(view.id, { next_contact: value });
    } catch {
      toast.error(L('Не удалось сохранить дату', 'Күн сақталмады'));
    } finally { setBusy(false); }
  };

  if (loading && items.length === 0) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  const tabs = [...STAGES.map((s) => ({ id: s.id, label: L(s.ru, s.kz) })),
    { id: 'due', label: L('Связаться сегодня', 'Бүгін хабарласу') }, { id: 'all', label: L('Все', 'Барлығы') }];

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{L('CRM: заявки на партнёрство', 'CRM: серіктестік өтінімдері')}</h2>
        <p className="text-sm text-gray-500">{L('Новые заявки агент проверяет сам и присылает в Telegram. Здесь — вся работа с партнёром.', 'Жаңа өтінімдерді агент тексеріп, Telegram-ға жібереді. Мұнда — серіктеспен бүкіл жұмыс.')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Button key={t.id} size="sm" variant={filter === t.id ? 'default' : 'outline'} onClick={() => setFilter(t.id)}
            className={t.id === 'due' && counts.due ? 'border-red-300 text-red-700' : ''}>
            {t.label}{counts[t.id] ? <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-xs">{counts[t.id]}</span> : null}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={fetchItems} disabled={loading} aria-label={L('Обновить', 'Жаңарту')}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-2">
        {visible.map((item) => {
          const st = STAGE[item.status || 'new'] || STAGE.new;
          const due = item.next_contact && item.next_contact <= today();
          return (
            <Card key={item.id} className="cursor-pointer transition hover:shadow-md" onClick={() => open(item)}>
              <CardContent className="p-3 sm:p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">№{item.id} · {item.name}</span>
                  <Badge className={`text-xs ${st.color}`}>{stageName(item.status)}</Badge>
                  {item.category && <Badge variant="outline" className="text-xs">{item.category}</Badge>}
                  {item.duplicate_of && <Badge variant="outline" className="border-amber-300 text-xs text-amber-700">{L('повторная', 'қайталама')} · №{item.duplicate_of}</Badge>}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{item.activity}</p>
                {item.last_note && <p className="mt-1 line-clamp-1 text-xs text-gray-500"><StickyNote className="mr-1 inline h-3 w-3" />{item.last_note}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
                  {item.next_contact && (
                    <span className={`flex items-center gap-1 ${due ? 'font-semibold text-red-600' : ''}`}>
                      <CalendarClock className="h-3 w-3" />{L('связаться', 'хабарласу')} {formatDate(item.next_contact, lang)}
                    </span>
                  )}
                  {item.created_at && <span>{formatDate(item.created_at, lang)}</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {visible.length === 0 && <p className="py-8 text-center text-gray-400">{L('Здесь пока пусто', 'Әзірге бос')}</p>}
      </div>

      <Dialog open={!!view} onOpenChange={() => setView(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>№{view?.id} · {view?.name}</DialogTitle>
          </DialogHeader>
          {view && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1">
                <p><span className="text-gray-500">{L('Деятельность:', 'Қызметі:')}</span> {view.activity}{view.category ? ` · ${view.category}` : ''}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a href={`tel:${view.phone}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5"><Phone className="h-3.5 w-3.5" />{view.phone}</a>
                  {waLink(view.whatsapp || view.phone) && (
                    <a href={waLink(view.whatsapp || view.phone)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-3 py-1.5 font-semibold text-white">
                      <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                    </a>
                  )}
                  <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-gray-600"
                    onClick={() => { void navigator.clipboard?.writeText(view.phone); toast.success(L('Номер скопирован', 'Нөмір көшірілді')); }}>
                    <Copy className="h-3.5 w-3.5" />{L('Копировать', 'Көшіру')}
                  </button>
                </div>
                {view.description && <p className="whitespace-pre-line pt-2 text-gray-700 dark:text-gray-300">{view.description}</p>}
                {view.duplicate_of && <p className="text-amber-700">{L('Повторная заявка — раньше была', 'Қайталама өтінім — бұрын болған')} №{view.duplicate_of}</p>}
              </div>

              <div>
                <p className="mb-1.5 font-semibold">{L('Этап', 'Кезең')}</p>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map((s) => (
                    <Button key={s.id} size="sm" disabled={busy} variant={(view.status || 'new') === s.id ? 'default' : 'outline'}
                      onClick={() => (view.status || 'new') !== s.id && changeStage(view.id, s.id)}>{L(s.ru, s.kz)}</Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 font-semibold">{L('Следующий контакт', 'Келесі байланыс')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={nextDate} min={today()} onChange={(e) => setNextDate(e.target.value)}
                    className="rounded-lg border bg-background px-3 py-1.5" aria-label={L('Дата следующего контакта', 'Келесі байланыс күні')} />
                  <Button size="sm" disabled={busy || !nextDate || nextDate === view.next_contact} onClick={() => saveNextContact(nextDate)}>{L('Сохранить', 'Сақтау')}</Button>
                  {view.next_contact && <Button size="sm" variant="ghost" disabled={busy} onClick={() => saveNextContact(null)}>{L('Убрать', 'Алып тастау')}</Button>}
                </div>
                <p className="mt-1 text-xs text-gray-500">{L('В этот день бот напомнит в Telegram.', 'Осы күні бот Telegram-да еске салады.')}</p>
              </div>

              <div>
                <p className="mb-1.5 font-semibold">{L('Заметка', 'Жазба')}</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000}
                  placeholder={L('Например: договорились о встрече, ждёт прайс…', 'Мысалы: кездесу туралы келістік…')}
                  className="w-full rounded-lg border bg-background p-2" />
                <Button size="sm" className="mt-1" disabled={busy || !note.trim()} onClick={addNote}>{L('Добавить заметку', 'Жазба қосу')}</Button>
              </div>

              <div>
                <p className="mb-1.5 font-semibold">{L('История', 'Тарих')}</p>
                <ol className="space-y-2 border-l pl-3">
                  {timeline.map((t) => (
                    <li key={t.id}>
                      <p className="font-medium">{t.title}{t.text ? <span className="font-normal text-gray-600 dark:text-gray-300"> — {t.text}</span> : null}</p>
                      <p className="text-xs text-gray-400">{t.at ? formatDate(t.at, lang) : ''}{t.via === 'telegram' ? ' · Telegram' : t.via === 'agent' ? ` · ${L('агент', 'агент')}` : t.actor ? ` · ${t.actor}` : ''}</p>
                    </li>
                  ))}
                  {timeline.length === 0 && <li className="text-gray-400">{L('Загрузка…', 'Жүктелуде…')}</li>}
                </ol>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
