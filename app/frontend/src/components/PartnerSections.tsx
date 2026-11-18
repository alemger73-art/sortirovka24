/** Sections of a partner page beyond the basics: key facts, prices, how it goes, reviews, questions and the request form. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronDown, Send, Star } from 'lucide-react';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { httpsLink } from '@/lib/directoryContent';
import { track } from '@/lib/analytics';

const card = 'rounded-3xl border bg-white p-6 dark:bg-gray-900';

export function PartnerFacts({ profile }: { profile: PartnerProfile }) {
  if (!profile.facts.length) return null;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{profile.facts.map(f => <div key={f.label} className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-950">
    <p className="text-2xl font-extrabold text-blue-700 dark:text-blue-300">{f.value}</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{f.label}</p></div>)}</div>;
}

export function PartnerPrices({ profile, onPick }: { profile: PartnerProfile; onPick: (title: string) => void }) {
  if (!profile.prices.length) return null;
  return <section id="prices" className="scroll-mt-24"><h2 className="text-2xl font-bold">Цены</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">{profile.prices.map(p => <article key={p.title} className={`flex flex-col rounded-3xl border p-6 ${p.featured ? 'border-blue-500 ring-2 ring-blue-500/30' : ''}`}>
      {p.featured && <span className="mb-3 self-start rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">Чаще выбирают</span>}
      <h3 className="text-lg font-bold">{p.title}</h3>
      <p className="mt-2 flex flex-wrap items-baseline gap-3"><span className="text-3xl font-extrabold">{p.price}</span>{p.old_price && <s className="text-gray-400">{p.old_price}</s>}</p>
      {p.note && <p className="mt-2 text-sm text-gray-500">{p.note}</p>}
      {!!p.includes.length && <ul className="mt-4 space-y-2 text-sm">{p.includes.map(i => <li key={i} className="flex gap-2"><Check className="h-5 w-5 shrink-0 text-blue-600" />{i}</li>)}</ul>}
      {profile.lead.enabled && <button type="button" onClick={() => onPick(p.title)} className="mt-5 min-h-12 rounded-2xl bg-blue-600 px-4 font-semibold text-white hover:opacity-90 sm:mt-auto">{profile.lead.button}</button>}
    </article>)}</div>
    {profile.prices_note && <p className="mt-4 text-sm text-gray-500">{profile.prices_note}</p>}
  </section>;
}

export function PartnerSteps({ profile }: { profile: PartnerProfile }) {
  if (!profile.steps.length) return null;
  return <section id="steps" className="scroll-mt-24"><h2 className="text-2xl font-bold">Как всё проходит</h2>
    <ol className="mt-5 space-y-3">{profile.steps.map((s, i) => <li key={s} className="flex gap-4 rounded-2xl border p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{i + 1}</span><span className="pt-1.5">{s}</span></li>)}</ol>
  </section>;
}

export function PartnerReviews({ profile }: { profile: PartnerProfile }) {
  const videos = profile.works.filter(w => w.kind === 'video');
  if (!profile.reviews.length && !httpsLink(profile.instagram)) return null;
  return <section id="reviews" className="scroll-mt-24"><h2 className="text-2xl font-bold">Отзывы</h2>
    {!!profile.reviews.length && <div className="mt-5 grid gap-4 sm:grid-cols-2">{profile.reviews.map((r, i) => <article key={i} className="rounded-3xl border p-5">
      <div className="flex gap-0.5" aria-label={`Оценка ${r.rating} из 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} className={`h-5 w-5 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />)}</div>
      <p className="mt-3 leading-relaxed">«{r.text}»</p>
      <p className="mt-3 text-sm text-gray-500">{r.author}{r.date && ` · ${r.date}`}{httpsLink(r.source) && <> · <a href={r.source} target="_blank" rel="noopener noreferrer" className="text-blue-600">источник</a></>}</p>
    </article>)}</div>}
    {(!!videos.length || httpsLink(profile.instagram)) && <p className="mt-4 text-sm text-gray-500">
      {videos.length ? 'Видеоотзывы учеников — в разделе «Работы и видео». ' : ''}Больше отзывов — в Instagram компании, раздел «Отзывы».
      {httpsLink(profile.instagram) && <a href={profile.instagram} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1 font-semibold text-blue-600">Открыть<ArrowUpRight className="h-4 w-4" /></a>}</p>}
  </section>;
}

export function PartnerFaq({ profile }: { profile: PartnerProfile }) {
  if (!profile.faq.length) return null;
  return <section id="faq" className="scroll-mt-24"><h2 className="text-2xl font-bold">Частые вопросы</h2>
    <div className="mt-5 space-y-3">{profile.faq.map(f => <details key={f.q} className="group rounded-2xl border p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">{f.q}<ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" /></summary>
      <p className="mt-3 leading-relaxed text-gray-600 dark:text-gray-300">{f.a}</p></details>)}</div>
  </section>;
}

/** A ready-made WhatsApp message to the company: the resident only has to press «Отправить». */
export function whatsappLeadUrl(profile: PartnerProfile, lead: { name: string; choice: string; comment: string }): string | null {
  const digits = profile.whatsapp.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const text = [
    'Здравствуйте! Пишу с сайта «Сортировка 24» (sortirovka24.kz).',
    lead.choice ? `Хочу записаться: ${lead.choice}.` : 'Хочу записаться.',
    `Меня зовут ${lead.name.trim()}.`,
    lead.comment.trim(),
  ].filter(Boolean).join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** The request form; options are the form's own list or the price titles.
 *  With a WhatsApp number it opens a chat with the company; otherwise the request goes to the company's Telegram. */
export function PartnerLeadForm({ profile, choice, onChoice }: { profile: PartnerProfile; choice: string; onChoice: (v: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  if (!profile.lead.enabled) return null;
  const options = profile.lead.options.length ? profile.lead.options : profile.prices.map(p => p.title);
  const viaWhatsapp = !!whatsappLeadUrl(profile, { name: '', choice: '', comment: '' });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chat = whatsappLeadUrl(profile, { name, choice, comment });
    if (chat) {
      track('partner_lead_whatsapp', { partner: profile.slug, choice });
      window.location.href = chat;
      return;
    }
    if (state === 'sending') return;
    setState('sending'); setError('');
    try {
      await partnerProfiles.sendLead(profile.slug, { name, phone, choice, comment });
      track('partner_lead', { partner: profile.slug, choice });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить. Попробуйте ещё раз.');
      setState('idle');
    }
  };
  const input = 'mt-1 w-full rounded-2xl border bg-transparent p-3.5 text-base';
  return <section id="lead" className={`${card} scroll-mt-24 border-blue-200 dark:border-blue-900`}>
    <h2 className="text-xl font-bold">{profile.lead.title}</h2>
    {state === 'sent' ? <div role="status" className="mt-4 rounded-2xl bg-green-50 p-4 text-green-800 dark:bg-green-950 dark:text-green-200">
      <p className="font-semibold">Заявка отправлена!</p><p className="mt-1 text-sm">{profile.name} получила её и скоро позвонит вам.</p></div>
    : <form onSubmit={submit} className="mt-4 space-y-3">
      {profile.lead.note && <p className="text-sm text-gray-500">{profile.lead.note}</p>}
      <label className="block text-sm font-medium">Как к вам обращаться<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={input} /></label>
      {!viaWhatsapp && <label className="block text-sm font-medium">Телефон<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7__ ___ __ __" value={phone} onChange={e => setPhone(e.target.value)} className={input} /></label>}
      {!!options.length && <label className="block text-sm font-medium">Что интересует<select value={choice} onChange={e => onChoice(e.target.value)} className={input}><option value="">Выберите</option>{options.map(o => <option key={o}>{o}</option>)}</select></label>}
      <label className="block text-sm font-medium">{viaWhatsapp ? 'Вопрос (если есть)' : 'Вопрос или удобное время звонка'}<textarea maxLength={400} rows={2} value={comment} onChange={e => setComment(e.target.value)} className={input} /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl ${viaWhatsapp ? 'bg-green-600' : 'bg-blue-600'} px-4 font-semibold text-white hover:opacity-90 disabled:opacity-60`}><Send className="h-5 w-5" />{viaWhatsapp ? `${profile.lead.button} в WhatsApp` : state === 'sending' ? 'Отправляем…' : profile.lead.button}</button>
      {viaWhatsapp ? !profile.lead.note && <p className="text-xs leading-relaxed text-gray-500">Откроется WhatsApp с готовым сообщением для {profile.name} — останется нажать «Отправить».</p>
      : <p className="text-xs leading-relaxed text-gray-500">Нажимая «{profile.lead.button}», вы соглашаетесь передать имя и телефон компании {profile.name}, чтобы с вами связались. <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline">Конфиденциальность</Link></p>}
    </form>}
  </section>;
}
