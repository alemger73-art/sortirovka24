/** «Мой дом» — neighbours of one house: API client and shared helpers. */
import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

export type NbKind = 'alarm' | 'question' | 'notice' | 'lost';
export type NbMember = {
  id: number; kind: 'flat' | 'private'; street: string; house: string; entrance: number | null; flat: string;
  display_name: string; anonymous: boolean; status: 'pending' | 'confirmed' | 'blocked'; role: 'member' | 'elder'; custom_street: number;
  title: string; public_name: string;
};
export type NbConfirm = { confirmed_in_house: number; needed: number; got: number; proof_sent: boolean; proof_waiting: boolean };
export type NbAuthor = { name: string; entrance: number | null; elder: boolean };
export type NbPost = {
  id: number; kind: NbKind; body: string; entrance: number | null; pinned: boolean; me_too: number; i_me_too: boolean;
  comments: number; created_at: string; last_activity: string; author: NbAuthor; mine: boolean; can_moderate: boolean;
};
export type NbComment = { id: number; body: string; created_at: string; mine: boolean; author: NbAuthor; is_author: boolean };
export type NbPostFull = NbPost & { hidden: boolean; thread: NbComment[] };
export type NbPerson = { id: number; name: string; entrance: number | null; elder: boolean; me: boolean; since: string; i_confirmed?: boolean; i_reported?: boolean };
export type NbHouse = { people: NbPerson[]; waiting: NbPerson[]; entrances: Record<string, number>; total: number; locked: boolean };
export type NbAddress = { kind: 'flat' | 'private'; street: string; house: string; entrance: string; flat: string; display_name: string; anonymous: boolean; consent: boolean };

type Bi = { ru: string; kz: string };
export const KINDS: { id: NbKind; emoji: string; title: Bi; hint: Bi }[] = [
  { id: 'alarm', emoji: '⚡', title: { ru: 'Авария', kz: 'Апат' }, hint: { ru: 'Нет света, воды, тепла, лифт, течь', kz: 'Жарық, су, жылу жоқ, лифт, ағып жатыр' } },
  { id: 'question', emoji: '❓', title: { ru: 'Вопрос', kz: 'Сұрақ' }, hint: { ru: 'Спросить соседей', kz: 'Көршілерден сұрау' } },
  { id: 'notice', emoji: '📢', title: { ru: 'Объявление', kz: 'Хабарландыру' }, hint: { ru: 'Собрание, сбор, ремонт', kz: 'Жиналыс, жинау, жөндеу' } },
  { id: 'lost', emoji: '🔍', title: { ru: 'Потеряно / найдено', kz: 'Жоғалды / табылды' }, hint: { ru: 'Ключи, животные, вещи', kz: 'Кілт, жануар, зат' } },
];
export const kindInfo = (k: NbKind) => KINDS.find((x) => x.id === k) || KINDS[1];

/** For an outage post — which page of the directory has the right phone numbers. */
const HELP: [RegExp, string, Bi][] = [
  [/свет|электр|жарық|розетк|щит/i, 'power', { ru: 'Куда звонить, если нет света', kz: 'Жарық жоқ болса — қайда қоңырау шалу' }],
  [/газ/i, 'gas', { ru: 'Запах газа — 104', kz: 'Газ иісі — 104' }],
  [/вод|кран|канализ|труб|затоп|су жоқ/i, 'water', { ru: 'Куда звонить, если нет воды', kz: 'Су жоқ болса — қайда қоңырау шалу' }],
  [/тепл|отопл|батаре|жылу|горяч/i, 'heat', { ru: 'Куда звонить, если нет тепла', kz: 'Жылу жоқ болса — қайда қоңырау шалу' }],
  [/мусор|контейнер|қоқыс/i, 'trash', { ru: 'Если не вывезли мусор', kz: 'Қоқыс шығарылмаса' }],
];
export function helpFor(body: string): { href: string; label: Bi } | null {
  const hit = HELP.find(([re]) => re.test(body));
  return hit ? { href: `/directory?s=${hit[1]}`, label: hit[2] } : null;
}

export function kzEntrance(n: number | null | undefined, kz: boolean) {
  if (!n) return '';
  return kz ? `${n}-кіреберіс` : `${n} подъезд`;
}

export { shrinkPhoto } from '@/lib/photo';

function base() { return `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/neighbors`; }
function adminToken() {
  try { return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || getAccountToken() || ''; } catch { return getAccountToken() || ''; }
}
async function call<T>(path: string, init: RequestInit = {}, token = getAccountToken()): Promise<T> {
  const r = await fetch(`${base()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  if (!r.ok) {
    let msg = r.status >= 500 ? 'Сервер не ответил, попробуйте ещё раз' : `Ошибка ${r.status}`;
    try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* plain */ }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return r.json() as Promise<T>;
}
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export type NbAdmin = {
  stats: { neighbours: number; houses: number; pending: number };
  waiting: { id: number; street: string; house: string; kind: string; entrance: number | null; flat: string; display_name: string; anonymous: number; custom_street: number; proof_at: string }[];
  houses: { building: string; title: string; people: number }[];
  hidden_posts: { id: number; building: string; kind: NbKind; body: string; reports: number; created_at: string }[];
  hidden_comments: { id: number; post_id: number; body: string; reports: number; created_at: string }[];
  blocked: { id: number; street: string; house: string; kind: string; entrance: number | null; flat: string; display_name: string; updated_at: string }[];
};

export const nbApi = {
  streets: () => call<{ streets: string[]; stats: { neighbours: number; houses: number } }>('/streets', {}, ''),
  me: () => call<{ member: NbMember | null; confirm?: NbConfirm; suggested_name?: string }>('/me'),
  save: (a: NbAddress) => call<{ member: NbMember; confirm: NbConfirm }>('/me', { method: 'PUT', body: JSON.stringify(a) }),
  leave: () => call<{ ok: boolean }>('/me', { method: 'DELETE' }),
  proof: (image: string) => call<{ member: NbMember; confirm: NbConfirm }>('/me/proof', post({ image })),
  house: () => call<NbHouse>('/house'),
  reportMember: (id: number) => call<{ blocked: boolean; marks: number }>(`/members/${id}/report`, { method: 'POST' }),
  confirm: (id: number) => call<{ confirmed: boolean; got?: number; needed?: number }>(`/confirm/${id}`, { method: 'POST' }),
  feed: (q: { before?: string; kind?: string; entrance?: boolean }) => {
    const p = new URLSearchParams(); if (q.before) p.set('before', q.before); if (q.kind) p.set('kind', q.kind); if (q.entrance) p.set('entrance', 'true');
    return call<{ items: NbPost[]; next: string }>(`/feed?${p}`);
  },
  create: (kind: NbKind, body: string, only_entrance: boolean) => call<NbPost>('/posts', post({ kind, body, only_entrance })),
  get: (id: number) => call<NbPostFull>(`/posts/${id}`),
  remove: (id: number) => call<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  comment: (id: number, body: string) => call<NbPostFull>(`/posts/${id}/comments`, post({ body })),
  removeComment: (id: number) => call<{ ok: boolean }>(`/comments/${id}`, { method: 'DELETE' }),
  meToo: (id: number) => call<{ me_too: number; i_me_too: boolean }>(`/posts/${id}/metoo`, { method: 'POST' }),
  pin: (id: number) => call<{ pinned: boolean }>(`/posts/${id}/pin`, { method: 'POST' }),
  report: (target: 'post' | 'comment', id: number) => call<{ hidden: boolean; already?: boolean }>('/report', post({ target, id })),
  admin: () => call<NbAdmin>('/admin', {}, adminToken()),
  adminHouse: (building: string) => call<{ items: { id: number; display_name: string; anonymous: number; entrance: number | null; flat: string; status: string; role: string; confirmed_at: string }[] }>(`/admin/house?building=${encodeURIComponent(building)}`, {}, adminToken()),
  adminProof: (id: number) => call<{ image: string }>(`/admin/proof/${id}`, {}, adminToken()),
  adminDecide: (id: number, approve: boolean) => call<{ answer: string }>(`/admin/proof/${id}`, post({ approve }), adminToken()),
  adminRole: (id: number, role: 'member' | 'elder') => call<{ ok: boolean }>(`/admin/members/${id}/role`, post({ role }), adminToken()),
  adminUnblock: (id: number) => call<{ ok: boolean }>(`/admin/members/${id}/unblock`, { method: 'POST' }, adminToken()),
  adminModerate: (target: 'post' | 'comment', id: number, keep: boolean) => call<{ ok: boolean }>('/admin/moderate', post({ target, id, keep }), adminToken()),
};
