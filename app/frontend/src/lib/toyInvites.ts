/** «Шақыру» — electronic invitations to a той (backend: routers/toy_invites.py). Texts, dates and the API. */
import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

export type ToyKind = 'wedding' | 'uzatu' | 'sundet' | 'tusau' | 'merey';
export type ToyTheme = 'night' | 'ivory' | 'pomegranate' | 'sky';
export type ToyLangs = 'both' | 'kz' | 'ru';
export type ProgramItem = { time: string; kz: string; ru: string };
export type ToyData = {
  kind: ToyKind; theme: ToyTheme; langs: ToyLangs; name1: string; name2: string; date: string; time: string;
  place: string; address: string; map_url: string; hosts: string; text_kz: string; text_ru: string; program: ProgramItem[]; photo?: string;
};
export type ToyStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'archived';
export type ToyInvite = {
  id: number; slug: string; status: ToyStatus; data: ToyData; price?: number | null; views?: number; link: string;
  created_at?: string; paid_at?: string | null; guests?: { coming: number; people: number; declined: number };
};
export type ToyGuest = { name: string; coming: boolean; guests: number; wish: string; at?: string };

type Bi = { kz: string; ru: string };
export const KIND_INFO: Record<ToyKind, { title: Bi; kicker: Bi; hint: Bi; two: boolean; name1: Bi; name2?: Bi; theme: ToyTheme }> = {
  wedding: { title: { kz: 'Үйлену тойы', ru: 'Свадьба' }, kicker: { kz: 'Үйлену тойы', ru: 'Свадебное торжество' }, hint: { kz: 'Шаңырақ көтеру', ru: 'Шаңырақ көтеру, свадьба' }, two: true, name1: { kz: 'Күйеу жігіт', ru: 'Жених' }, name2: { kz: 'Қалыңдық', ru: 'Невеста' }, theme: 'night' },
  uzatu: { title: { kz: 'Қыз ұзату', ru: 'Қыз ұзату' }, kicker: { kz: 'Қыз ұзату', ru: 'Проводы невесты' }, hint: { kz: 'Қызымызды ұзату', ru: 'Проводы дочери' }, two: false, name1: { kz: 'Қыздың аты', ru: 'Имя дочери' }, theme: 'ivory' },
  sundet: { title: { kz: 'Сүндет той', ru: 'Сүндет той' }, kicker: { kz: 'Сүндет той', ru: 'Сүндет той' }, hint: { kz: 'Ұлымыздың тойы', ru: 'Праздник сына' }, two: false, name1: { kz: 'Ұлдың аты', ru: 'Имя сына' }, theme: 'pomegranate' },
  tusau: { title: { kz: 'Тұсаукесер', ru: 'Тұсаукесер' }, kicker: { kz: 'Тұсаукесер', ru: 'Праздник первых шагов' }, hint: { kz: 'Алғашқы қадам', ru: 'Первые шаги малыша' }, two: false, name1: { kz: 'Баланың аты', ru: 'Имя малыша' }, theme: 'sky' },
  merey: { title: { kz: 'Мерейтой', ru: 'Юбилей' }, kicker: { kz: 'Мерейтой', ru: 'Юбилей' }, hint: { kz: 'Мерейтой, туған күн', ru: 'Юбилей, день рождения' }, two: false, name1: { kz: 'Мерейтой иесі', ru: 'Юбиляр' }, theme: 'pomegranate' },
};
export const KINDS = Object.keys(KIND_INFO) as ToyKind[];

const GREETING_KZ = 'Құрметті ағайын-туыс, құда-жекжат, дос-жарандар!';
export const TEXTS: Record<ToyKind, Bi> = {
  wedding: { kz: `${GREETING_KZ} Сіздерді балаларымыздың шаңырақ көтеру салтанатына арналған ақ дастарханымыздың қадірлі қонағы болуға шақырамыз!`, ru: 'Дорогие родные, сваты, друзья! Приглашаем вас быть почётными гостями нашего дастархана в честь создания новой семьи наших детей!' },
  uzatu: { kz: `${GREETING_KZ} Сіздерді аяулы қызымызды ұзату тойына арналған ақ дастарханымыздың қадірлі қонағы болуға шақырамыз!`, ru: 'Дорогие родные, сваты, друзья! Приглашаем вас на қыз ұзату — праздник проводов нашей любимой дочери!' },
  sundet: { kz: `${GREETING_KZ} Сіздерді ұлымыздың сүндет тойына арналған ақ дастарханымыздың қадірлі қонағы болуға шақырамыз!`, ru: 'Дорогие родные, сваты, друзья! Приглашаем вас на сүндет той нашего сына — разделить с нами радость этого дня!' },
  tusau: { kz: 'Құрметті ағайын-туыс, дос-жарандар! Сіздерді балапанымыздың алғашқы қадамына арналған тұсаукесер тойына шақырамыз!', ru: 'Дорогие родные и друзья! Приглашаем вас на тұсаукесер — праздник первых шагов нашего малыша!' },
  merey: { kz: 'Құрметті ағайын-туыс, дос-жарандар! Сіздерді мерейтой салтанатына арналған ақ дастарханымыздың қадірлі қонағы болуға шақырамыз!', ru: 'Дорогие родные и друзья! Приглашаем вас разделить с нами радость юбилея за праздничным дастарханом!' },
};
const P = (time: string, kz: string, ru: string): ProgramItem => ({ time, kz, ru });
const MEET = P('17:30', 'Қонақтарды қарсы алу', 'Встреча гостей');
export const PROGRAMS: Record<ToyKind, ProgramItem[]> = {
  wedding: [MEET, P('18:00', 'Тойдың басталуы, ақ бата', 'Начало торжества, ақ бата'), P('19:30', 'Беташар және жас жұбайлардың алғашқы биі', 'Беташар и первый танец молодых'), P('21:30', 'Той торты', 'Свадебный торт')],
  uzatu: [MEET, P('18:00', 'Тойдың басталуы', 'Начало торжества'), P('20:00', 'Қыз ұзату рәсімі', 'Обряд проводов невесты'), P('22:00', 'Қоштасу', 'Прощание')],
  sundet: [MEET, P('18:00', 'Тойдың басталуы, ақ бата', 'Начало торжества, ақ бата'), P('19:00', 'Той иесін құттықтау', 'Чествование виновника торжества')],
  tusau: [P('17:00', 'Қонақтарды қарсы алу', 'Встреча гостей'), P('17:30', 'Тұсау кесу рәсімі', 'Обряд тұсау кесу'), P('18:00', 'Мерекелік дастархан', 'Праздничный дастархан')],
  merey: [P('18:00', 'Қонақтарды қарсы алу', 'Встреча гостей'), P('18:30', 'Мерейтойдың басталуы', 'Начало торжества'), P('20:00', 'Тілектер мен құттықтаулар', 'Поздравления и пожелания')],
};

/** «Айбек пен Аружан» — the Kazakh «and» depends on the last letter of the first name. */
export function kzAnd(name: string): string {
  const last = name.trim().slice(-1).toLowerCase();
  if (!last || 'аәеёиоөуұүыіэюялрйу'.includes(last)) return 'мен';
  if ('мнңзж'.includes(last)) return 'бен';
  return 'пен';
}

const MONTHS: Record<'kz' | 'ru', string[]> = {
  kz: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const MONTHS_NOM: Record<'kz' | 'ru', string[]> = {
  kz: MONTHS.kz,
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};
const WEEKDAYS: Record<'kz' | 'ru', string[]> = {
  kz: ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
};
export function dateParts(iso: string, lang: 'kz' | 'ru') {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return { day: d || 1, month: MONTHS_NOM[lang][(m || 1) - 1], monthGen: MONTHS[lang][(m || 1) - 1], weekday: WEEKDAYS[lang][dt.getUTCDay()], year: y };
}
/** Event start in Kazakhstan time (UTC+5). */
export function eventTime(data: Pick<ToyData, 'date' | 'time'>): Date {
  return new Date(`${data.date}T${data.time || '18:00'}:00+05:00`);
}

export function emptyData(kind: ToyKind = 'wedding'): ToyData {
  const d = new Date(Date.now() + 45 * 86400000);
  const iso = new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 10);
  return {
    kind, theme: KIND_INFO[kind].theme, langs: 'both', name1: '', name2: '', date: iso, time: '18:00',
    place: '', address: '', map_url: '', hosts: '', text_kz: TEXTS[kind].kz, text_ru: TEXTS[kind].ru, program: PROGRAMS[kind].map((p) => ({ ...p })),
  };
}
export const SAMPLE: ToyData = {
  ...emptyData('wedding'), name1: 'Айбек', name2: 'Аружан', place: '«Мерей» мейрамханасы', address: 'Қарағанды, Сортировка', hosts: 'Нұрлан – Гүлнар',
};

export const tenge = (n?: number | null) => `${Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;

function base() { return `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/toy`; }
function adminToken() {
  try { return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || getAccountToken() || ''; } catch { return getAccountToken() || ''; }
}
async function call<T>(path: string, init: RequestInit = {}, token = getAccountToken()): Promise<T> {
  const r = await fetch(`${base()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* plain */ }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return r.json() as Promise<T>;
}
export const toyApi = {
  config: () => call<{ enabled: boolean; price: number }>('/config'),
  create: (data: ToyData) => call<ToyInvite>('/invites', { method: 'POST', body: JSON.stringify({ data }) }),
  update: (id: number, data: ToyData) => call<ToyInvite>(`/invites/${id}`, { method: 'PUT', body: JSON.stringify({ data }) }),
  get: (id: number) => call<ToyInvite>(`/invites/${id}`),
  mine: () => call<{ items: ToyInvite[] }>('/invites/mine'),
  remove: (id: number) => call<{ ok: boolean }>(`/invites/${id}`, { method: 'DELETE' }),
  publish: (id: number) => call<ToyInvite>(`/invites/${id}/publish`, { method: 'POST' }),
  guests: (id: number) => call<{ items: ToyGuest[]; coming: number; people: number; declined: number }>(`/invites/${id}/guests`),
  publicGet: (slug: string) => call<{ slug: string; data: ToyData; status: ToyStatus; preview: boolean; owner: boolean }>(`/public/${encodeURIComponent(slug)}`),
  rsvp: (slug: string, body: { visitor: string; name: string; coming: boolean; guests: number; wish: string }) =>
    call<ToyGuest>(`/public/${encodeURIComponent(slug)}/rsvp`, { method: 'POST', body: JSON.stringify(body) }),
  adminSettings: () => call<{ enabled: boolean; price: number; kaspi_link: string }>('/admin/settings', {}, adminToken()),
  adminSave: (cfg: { enabled: boolean; price: number; kaspi_link: string }) => call<{ enabled: boolean; price: number; kaspi_link: string }>('/admin/settings', { method: 'PUT', body: JSON.stringify(cfg) }, adminToken()),
  adminList: () => call<{ items: (ToyInvite & { phone?: string })[] }>('/admin/invites', {}, adminToken()),
  adminAction: (id: number, action: 'paid' | 'reject') => call<{ answer: string; item: ToyInvite }>(`/admin/invites/${id}`, { method: 'POST', body: JSON.stringify({ action }) }, adminToken()),
};
