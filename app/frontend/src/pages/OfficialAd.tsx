/**
 * «Разместить в Sortirovka Official»: why it pays off (30 000 local subscribers), the three prices,
 * how it works, then the text + photos. The owner checks it in Telegram and picks the category;
 * the person gets the price and a Kaspi link in WhatsApp. Payment happens only after the check.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BadgeCheck, Briefcase, Camera, Check, ChevronLeft, Clock, CreditCard, Home, Info, Loader2, MessageCircle,
  Send, Store, Users,
} from 'lucide-react';
import Layout from '@/components/Layout';
import MultiImageUpload from '@/components/MultiImageUpload';
import { useLanguage } from '@/contexts/LanguageContext';
import { accountApi, getAccountToken } from '@/lib/accountApi';
import { getAccountPrefill } from '@/lib/localAuth';
import { formatKzPhone, normalizeKzPhone } from '@/lib/adKinds';
import { track } from '@/lib/analytics';
import { usePageSeo } from '@/hooks/usePageSeo';
import {
  OFFICIAL_FALLBACK, type OfficialCategory, type OfficialConfig, type OfficialRequest,
  STATUS_INFO, guessCategory, officialAds, tenge,
} from '@/lib/officialAds';

const ICONS: Record<string, typeof Store> = { business: Store, services: Home, private: Briefcase };
const field = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900/40';


export default function OfficialAd() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const [params] = useSearchParams();
  const adId = Number(params.get('ad')) || null;
  const [cfg, setCfg] = useState<OfficialConfig>(OFFICIAL_FALLBACK);
  const [wish, setWish] = useState<OfficialCategory['code'] | ''>('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<OfficialRequest | null>(null);
  const [mine, setMine] = useState<OfficialRequest[]>([]);
  const formRef = useRef<HTMLDivElement>(null);
  const authed = Boolean(getAccountToken());

  usePageSeo({
    title: tx('Разместить в Sortirovka Official — 30 000 жителей Сортировки', 'Sortirovka Official-да орналастыру'),
    description: tx('Покажем ваше объявление 30 000 подписчикам Sortirovka Official. Бизнес — 5 000 тг, недвижимость и услуги — 3 000 тг, вакансии и частные — 1 500 тг.', 'Хабарландыруыңызды Sortirovka Official-дың 30 000 жазылушысына көрсетеміз.'),
  });

  useEffect(() => {
    officialAds.config().then(setCfg).catch(() => {});
    const p = getAccountPrefill();
    setPhone((v) => v || p.phone || ''); setName((v) => v || p.name || '');
    if (!authed) return;
    accountApi.me().then((me: any) => { setPhone((v) => v || me?.phone || ''); setName((v) => v || me?.name || ''); }).catch(() => {});
    officialAds.mine().then((r) => setMine(r.items)).catch(() => {});
    if (adId) {
      accountApi.getMyAnnouncement(adId).then((a: any) => {
        setBody((v) => v || [a.title, a.price ? `Цена: ${a.price}` : '', a.description, a.address ? `📍 ${a.address}` : '', a.phone ? `📞 ${a.phone}` : ''].filter(Boolean).join('\n'));
        setPhotos((v) => v || String(a.gallery_images || a.image_url || ''));
        setWish((v) => v || guessCategory(a.ann_type));
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo(() => cfg.categories.find((c) => c.code === wish), [cfg, wish]);
  const photoList = photos.split(',').map((p) => p.trim()).filter(Boolean);

  function pick(code: OfficialCategory['code']) {
    setWish(code);
    track('official_pick', { code });
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  async function submit() {
    if (sending) return;
    if (body.trim().length < 10) { toast.error(tx('Напишите текст объявления — хотя бы одно предложение', 'Хабарландыру мәтінін жазыңыз')); return; }
    if (normalizeKzPhone(phone).length < 11) { toast.error(tx('Укажите номер WhatsApp — туда придёт сумма и ссылка на оплату', 'WhatsApp нөмірін жазыңыз')); return; }
    setSending(true);
    try {
      const req = await officialAds.create({ body: body.trim(), photos: photoList, phone: `+${normalizeKzPhone(phone)}`, name: name.trim(), ann_id: adId, wish: wish || undefined });
      track('official_submit', { code: wish || 'none', photos: photoList.length });
      setDone(req); setMine((m) => [req, ...m]);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      toast.error(e?.message && !/^HTTP/.test(e.message) ? e.message : tx('Не получилось отправить. Проверьте интернет и попробуйте ещё раз.', 'Жіберілмеді. Қайталап көріңіз.'));
    } finally { setSending(false); }
  }

  if (done) return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-14 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/40"><Send className="h-9 w-9 text-sky-600" /></div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{tx('Заявка отправлена', 'Өтінім жіберілді')}</h1>
        <p className="mt-3 text-gray-600 dark:text-slate-300">{tx('Мы проверим объявление и определим категорию. В WhatsApp на номер ', 'Хабарландыруды тексеріп, санатын анықтаймыз. WhatsApp-қа ')}<b>{formatKzPhone(done.phone || phone)}</b>{tx(' придёт сумма и ссылка на оплату через Kaspi.', ' сома мен Kaspi сілтемесі келеді.')}</p>
        <ol className="mt-6 space-y-2 text-left text-sm">
          {[tx('Заявка у нас', 'Өтінім бізде'), tx('Проверяем и выбираем категорию', 'Тексеріп, санатын таңдаймыз'), tx('Оплата по ссылке Kaspi', 'Kaspi арқылы төлем'), tx('Публикуем в канале', 'Арнада жариялаймыз')].map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-900">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-slate-800'}`}>{i === 0 ? <Check className="h-4 w-4" /> : i + 1}</span>
              <span className={i === 0 ? 'font-semibold text-gray-900 dark:text-slate-100' : 'text-gray-600 dark:text-slate-300'}>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-gray-500 dark:text-slate-400">{tx('Обычно отвечаем в течение пары часов днём. Статус заявки виден на этой странице.', 'Әдетте күндіз бірнеше сағатта жауап береміз.')}</p>
        <div className="mt-6 grid gap-3">
          <button type="button" onClick={() => { setDone(null); setBody(''); setPhotos(''); setWish(''); }} className="rounded-xl bg-sky-600 px-5 py-3.5 font-semibold text-white hover:bg-sky-700">{tx('Мои заявки', 'Менің өтінімдерім')}</button>
          <Link to="/announcements" className="py-2 text-sm font-medium text-sky-700 dark:text-sky-300">{tx('К объявлениям', 'Хабарландыруларға')}</Link>
        </div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        <Link to="/announcements" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-slate-400"><ChevronLeft className="h-4 w-4" />{tx('Объявления', 'Хабарландырулар')}</Link>

        {/* Why it pays off */}
        <section data-testid="official-hero" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-700 via-sky-600 to-cyan-500 p-5 text-white shadow-sm sm:p-7">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><BadgeCheck className="h-4 w-4" />{cfg.channel}</span>
          <p className="mt-4 text-5xl font-black leading-none tracking-tight sm:text-6xl">{cfg.subscribers}</p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white/80">{tx('живых подписчиков — жителей Сортировки', 'тірі жазылушы — Сортировка тұрғындары')}</p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/95">{cfg.intro}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
            {[{ i: Users, t: tx('Клиенты и покупатели', 'Клиенттер мен сатып алушылар') }, { i: Home, t: tx('Арендаторы', 'Жалға алушылар') }, { i: Briefcase, t: tx('Сотрудники', 'Қызметкерлер') }].map(({ i: Icon, t }) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"><Icon className="h-3.5 w-3.5" />{t}</span>
            ))}
          </div>
        </section>

        {mine.length > 0 && <MyRequests items={mine} cfg={cfg} kz={kz} />}

        {/* Prices */}
        <section className="mt-7" aria-labelledby="official-prices">
          <h2 id="official-prices" className="text-xl font-bold text-gray-900 dark:text-slate-100">{tx('Выберите категорию', 'Санатты таңдаңыз')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{tx('Цена за одну публикацию в канале.', 'Арнадағы бір жарияланым бағасы.')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {cfg.categories.map((c) => {
              const Icon = ICONS[c.code] || Store;
              const on = wish === c.code;
              return (
                <button key={c.code} type="button" data-testid={`official-cat-${c.code}`} aria-pressed={on} onClick={() => pick(c.code)}
                  className={`flex flex-col rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${on ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-200 dark:bg-sky-900/20 dark:ring-sky-800' : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${on ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700 dark:bg-slate-800 dark:text-sky-300'}`}><Icon className="h-5 w-5" /></span>
                    {on && <Check className="h-5 w-5 text-sky-600" />}
                  </span>
                  <span className="mt-3 font-semibold text-gray-900 dark:text-slate-100">{c.title}</span>
                  <span className="mt-1 text-2xl font-black text-sky-700 dark:text-sky-300">{tenge(c.price)}</span>
                  <span className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{c.description}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-gray-100 px-3 py-2.5 text-sm text-gray-600 dark:bg-slate-900 dark:text-slate-300"><Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />{tx('Сомневаетесь, какую выбрать? Выберите ближе всего — после проверки мы сами подтвердим категорию и сумму. Платить нужно только после этого.', 'Қайсысын таңдарыңызды білмесеңіз — ең жақынын таңдаңыз. Тексерген соң санат пен соманы өзіміз растаймыз.')}</p>
        </section>

        {/* How it works */}
        <section className="mt-7" aria-labelledby="official-how">
          <h2 id="official-how" className="text-xl font-bold text-gray-900 dark:text-slate-100">{tx('Как это работает', 'Қалай жұмыс істейді')}</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-4">
            {[
              { i: Send, t: tx('Отправляете текст и фото', 'Мәтін мен фото жібересіз') },
              { i: Clock, t: tx('Проверяем и подбираем категорию', 'Тексеріп, санатын таңдаймыз') },
              { i: MessageCircle, t: tx('В WhatsApp — сумма и ссылка Kaspi', 'WhatsApp-қа сома мен Kaspi сілтемесі') },
              { i: BadgeCheck, t: tx('После оплаты публикуем в канале', 'Төлемнен кейін арнада жариялаймыз') },
            ].map(({ i: Icon, t }, n) => (
              <li key={t} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-col sm:items-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700 dark:bg-slate-800 dark:text-sky-300"><Icon className="h-4 w-4" /></span>
                <span className="text-sm text-gray-700 dark:text-slate-200"><b className="text-gray-400">{n + 1}.</b> {t}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Form */}
        <section ref={formRef} className="mt-7 scroll-mt-20 rounded-3xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900" aria-labelledby="official-form">
          <h2 id="official-form" className="text-xl font-bold text-gray-900 dark:text-slate-100">{tx('Ваше объявление', 'Сіздің хабарландыруыңыз')}</h2>
          {chosen
            ? <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{tx('Категория: ', 'Санат: ')}<b>{chosen.title}</b> · {tenge(chosen.price)} <button type="button" onClick={() => setWish('')} className="ml-1 text-sky-700 underline dark:text-sky-300">{tx('изменить', 'өзгерту')}</button></p>
            : <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{tx('Категорию можно не выбирать — подберём сами.', 'Санатты таңдамауға болады — өзіміз таңдаймыз.')}</p>}

          {!authed ? (
            <div className="mt-4 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 dark:bg-sky-900/20 dark:text-sky-100">
              <p>{tx('Чтобы отправить заявку и видеть её статус, войдите в аккаунт — это минута.', 'Өтінім жіберу үшін аккаунтқа кіріңіз.')}</p>
              <Link to={`/account?redirect=${encodeURIComponent(`/announcements/official${adId ? `?ad=${adId}` : ''}`)}`} data-testid="official-login" className="mt-3 inline-flex rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white">{tx('Войти и продолжить', 'Кіріп жалғастыру')}</Link>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              <div>
                <label htmlFor="of-body" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-slate-200">{tx('Текст для публикации', 'Жариялау мәтіні')}</label>
                <textarea id="of-body" data-testid="official-body" rows={7} maxLength={3500} value={body} onChange={(e) => setBody(e.target.value)} className={`${field} resize-y`}
                  placeholder={tx('Что предлагаете, цена, адрес, как связаться. Например: «Открылся магазин «Береке» на Ермекова, 12. Скидка 20% на всё до воскресенья. Тел. +7 700 …»', 'Не ұсынасыз, баға, мекенжай, байланыс.')} />
                <p className="mt-1 flex justify-between text-xs text-gray-400"><span>{tx('Подсказка: укажите телефон в тексте — так вам позвонят прямо из канала.', 'Кеңес: мәтінге телефон жазыңыз.')}</span><span>{body.length}/3500</span></p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-slate-200"><Camera className="h-4 w-4" />{tx('Фото', 'Фото')} <span className="font-normal text-gray-400">· {tx('до 10 шт., необязательно', '10 данаға дейін')}</span></p>
                <MultiImageUpload value={photos} onChange={(v: string) => setPhotos(v)} folder="announcements" maxImages={10} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="of-phone" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-slate-200">{tx('WhatsApp для ответа', 'Жауапқа WhatsApp')}</label>
                  <input id="of-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 700 123 45 67" className={field} />
                </div>
                <div>
                  <label htmlFor="of-name" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-slate-200">{tx('Имя или компания', 'Аты не компания')}</label>
                  <input id="of-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={field} />
                </div>
              </div>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-gray-500 dark:text-slate-400"><CreditCard className="mt-0.5 h-4 w-4 shrink-0" />{tx('Сейчас ничего платить не нужно. Оплата — только после проверки, по ссылке Kaspi, которая придёт в WhatsApp от Сортировка 24.', 'Қазір төлеудің қажеті жоқ. Төлем тек тексерістен кейін, WhatsApp-қа келетін Kaspi сілтемесі арқылы.')}</p>
              <button type="button" data-testid="official-submit" disabled={sending || !cfg.enabled} onClick={() => void submit()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                {sending ? <><Loader2 className="h-5 w-5 animate-spin" />{tx('Отправляем…', 'Жіберілуде…')}</> : <><Send className="h-5 w-5" />{cfg.enabled ? tx('Отправить на проверку', 'Тексеруге жіберу') : tx('Приём временно закрыт', 'Қабылдау уақытша жабық')}</>}
              </button>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function MyRequests({ items, cfg, kz }: { items: OfficialRequest[]; cfg: OfficialConfig; kz: boolean }) {
  const tx = (ru: string, k: string) => (kz ? k : ru);
  return (
    <section className="mt-6" aria-labelledby="official-mine" data-testid="official-mine">
      <h2 id="official-mine" className="text-lg font-bold text-gray-900 dark:text-slate-100">{tx('Мои заявки', 'Менің өтінімдерім')}</h2>
      <ul className="mt-2 space-y-2">
        {items.slice(0, 5).map((r) => {
          const info = STATUS_INFO[r.status] || STATUS_INFO.new;
          const cat = cfg.categories.find((c) => c.code === r.category);
          return (
            <li key={r.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">№{r.id} · {new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${info.tone}`}>{kz ? info.kz : info.ru}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-gray-800 dark:text-slate-200">{r.body}</p>
              {cat && <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{cat.title} · {tenge(r.price ?? cat.price)}</p>}
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{kz ? info.hint.kz : info.hint.ru}</p>
              {r.status === 'priced' && r.pay_link && (
                <a href={r.pay_link} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 font-semibold text-white hover:bg-red-700"><CreditCard className="h-4 w-4" />{tx('Оплатить в Kaspi', 'Kaspi арқылы төлеу')} · {tenge(r.price)}</a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
