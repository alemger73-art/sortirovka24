/** Admin editor for the parts of a partner page beyond the basics: prices, facts, steps, reviews, questions and requests. */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { partnerProfiles, type PartnerLead, type PartnerProfile } from '@/lib/partnerProfiles';

type Props = { edit: PartnerProfile; setEdit: (p: PartnerProfile) => void; saved: boolean };
const box = 'mt-1 w-full rounded border bg-transparent p-2';
const lines = (v: string) => v.split('\n');

function replace<T>(list: T[], i: number, patch: Partial<T>): T[] {
  return list.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

export default function PartnerProfileExtras({ edit, setEdit, saved }: Props) {
  const [link, setLink] = useState<{ url: string; linked: number } | null>(null);
  const [leads, setLeads] = useState<PartnerLead[] | null>(null);
  const set = (patch: Partial<PartnerProfile>) => setEdit({ ...edit, ...patch });
  const lead = edit.lead;

  return <div className="space-y-6">
    <div><h3 className="font-semibold">Цены</h3><p className="text-sm text-gray-500">Курсы, пакеты, услуги. «Главное предложение» подсвечивается.</p>
      {edit.prices.map((p, i) => <div key={i} className="mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
        <label className="text-sm">Название<input required value={p.title} onChange={e => set({ prices: replace(edit.prices, i, { title: e.target.value }) })} className={box} /></label>
        <label className="text-sm">Цена<input required placeholder="55 000 ₸" value={p.price} onChange={e => set({ prices: replace(edit.prices, i, { price: e.target.value }) })} className={box} /></label>
        <label className="text-sm">Старая цена (зачёркнута)<input value={p.old_price} onChange={e => set({ prices: replace(edit.prices, i, { old_price: e.target.value }) })} className={box} /></label>
        <label className="text-sm">Пояснение<input value={p.note} onChange={e => set({ prices: replace(edit.prices, i, { note: e.target.value }) })} className={box} /></label>
        <label className="text-sm sm:col-span-2">Что входит — каждое с новой строки<textarea rows={3} value={p.includes.join('\n')} onChange={e => set({ prices: replace(edit.prices, i, { includes: lines(e.target.value) }) })} className={box} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.featured} onChange={e => set({ prices: replace(edit.prices, i, { featured: e.target.checked }) })} />Главное предложение</label>
        <Button type="button" variant="outline" onClick={() => set({ prices: edit.prices.filter((_, j) => j !== i) })}>Убрать</Button>
      </div>)}
      <Button type="button" variant="outline" className="mt-3" disabled={edit.prices.length >= 12} onClick={() => set({ prices: [...edit.prices, { title: '', price: '', old_price: '', note: '', includes: [], featured: false }] })}>Добавить цену</Button>
      <label className="mt-3 block text-sm">Примечание под ценами<input value={edit.prices_note} onChange={e => set({ prices_note: e.target.value })} className={box} /></label>
    </div>

    <label className="block text-sm font-medium">Цифры о компании — по одной в строке: «2 месяца | от записи до экзамена»
      <textarea rows={4} value={edit.facts.map(f => `${f.value} | ${f.label}`).join('\n')} onChange={e => set({ facts: lines(e.target.value).map(l => { const [value = '', ...rest] = l.split('|'); return { value: value.trim(), label: rest.join('|').trim() }; }).filter(f => f.value || f.label) })} className={box} /></label>

    <label className="block text-sm font-medium">Как всё проходит — шаги по порядку, каждый с новой строки
      <textarea rows={5} value={edit.steps.join('\n')} onChange={e => set({ steps: lines(e.target.value) })} className={box} /></label>

    <div><h3 className="font-semibold">Частые вопросы</h3>
      {edit.faq.map((f, i) => <div key={i} className="mt-3 space-y-2 rounded-xl border p-3">
        <label className="block text-sm">Вопрос<input required value={f.q} onChange={e => set({ faq: replace(edit.faq, i, { q: e.target.value }) })} className={box} /></label>
        <label className="block text-sm">Ответ<textarea required rows={2} value={f.a} onChange={e => set({ faq: replace(edit.faq, i, { a: e.target.value }) })} className={box} /></label>
        <Button type="button" variant="outline" onClick={() => set({ faq: edit.faq.filter((_, j) => j !== i) })}>Убрать</Button>
      </div>)}
      <Button type="button" variant="outline" className="mt-3" disabled={edit.faq.length >= 12} onClick={() => set({ faq: [...edit.faq, { q: '', a: '' }] })}>Добавить вопрос</Button>
    </div>

    <div><h3 className="font-semibold">Отзывы</h3><p className="text-sm text-gray-500">Только настоящие отзывы клиентов, с согласия компании. Укажите, где отзыв опубликован.</p>
      {edit.reviews.map((r, i) => <div key={i} className="mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
        <label className="text-sm">Имя автора<input required value={r.author} onChange={e => set({ reviews: replace(edit.reviews, i, { author: e.target.value }) })} className={box} /></label>
        <label className="text-sm">Оценка<select value={r.rating} onChange={e => set({ reviews: replace(edit.reviews, i, { rating: Number(e.target.value) }) })} className={box}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="text-sm sm:col-span-2">Текст отзыва<textarea required rows={3} value={r.text} onChange={e => set({ reviews: replace(edit.reviews, i, { text: e.target.value }) })} className={box} /></label>
        <label className="text-sm">Когда<input placeholder="октябрь 2026" value={r.date} onChange={e => set({ reviews: replace(edit.reviews, i, { date: e.target.value }) })} className={box} /></label>
        <label className="text-sm">Ссылка на источник<input type="url" value={r.source} onChange={e => set({ reviews: replace(edit.reviews, i, { source: e.target.value }) })} className={box} /></label>
        <Button type="button" variant="outline" onClick={() => set({ reviews: edit.reviews.filter((_, j) => j !== i) })}>Убрать</Button>
      </div>)}
      <Button type="button" variant="outline" className="mt-3" disabled={edit.reviews.length >= 20} onClick={() => set({ reviews: [...edit.reviews, { author: '', text: '', rating: 5, date: '', source: '' }] })}>Добавить отзыв</Button>
    </div>

    <div className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Заявки от жителей</h3>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={lead.enabled} onChange={e => set({ lead: { ...lead, enabled: e.target.checked } })} />Показывать форму «Записаться» — заявки приходят компании в Telegram</label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Заголовок формы<input value={lead.title} onChange={e => set({ lead: { ...lead, title: e.target.value } })} className={box} /></label>
        <label className="text-sm">Текст кнопки<input value={lead.button} onChange={e => set({ lead: { ...lead, button: e.target.value } })} className={box} /></label>
      </div>
      <label className="block text-sm">Подсказка под заголовком<input value={lead.note} onChange={e => set({ lead: { ...lead, note: e.target.value } })} className={box} /></label>
      <label className="block text-sm">Варианты «Что интересует» — каждый с новой строки (пусто — названия цен)<textarea rows={3} value={lead.options.join('\n')} onChange={e => set({ lead: { ...lead, options: lines(e.target.value) } })} className={box} /></label>
      {saved ? <div className="space-y-2">
        <Button type="button" variant="outline" onClick={() => partnerProfiles.telegramLink(edit.slug).then(setLink).catch(e => toast.error(e.message))}>Ссылка для Telegram компании</Button>
        {link && <p className="text-sm">Отправьте компании эту ссылку — откройте её в Telegram на телефоне сотрудника (действует 7 дней, подключить можно нескольких):<br /><a href={link.url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600">{link.url}</a><br />Уже подключено чатов: {link.linked}</p>}
        <Button type="button" variant="outline" onClick={() => partnerProfiles.leads(edit.slug).then(r => setLeads(r.items)).catch(e => toast.error(e.message))}>Последние заявки</Button>
        {leads && (leads.length ? <ul className="space-y-1 text-sm">{leads.slice(0, 30).map(l => <li key={l.id}>№{l.id} · {l.created_at.slice(0, 16).replace('T', ' ')} · {l.name}, {l.phone}{l.choice && ` · ${l.choice}`} · {l.status === 'new' ? 'ждёт звонка' : `связались (${l.accepted_by})`}</li>)}</ul> : <p className="text-sm text-gray-500">Заявок пока нет.</p>)}
      </div> : <p className="text-sm text-gray-500">Сохраните карточку — после этого появится ссылка для Telegram.</p>}
    </div>
  </div>;
}
