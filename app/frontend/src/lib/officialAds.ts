/** «Разместить в Sortirovka Official» — paid placement in the district Telegram channel (backend: routers/official_ads.py). */
import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

export type OfficialCategory = { code: 'business' | 'services' | 'private'; title: string; price: number; description: string; kaspi_link?: string };
export type OfficialConfig = { enabled: boolean; channel: string; subscribers: string; intro: string; categories: OfficialCategory[] };
export type OfficialStatus = 'new' | 'priced' | 'paid' | 'published' | 'rejected';
export type OfficialRequest = {
  id: number; created_at: string; updated_at?: string; body: string; photos: string[]; ann_id?: number | null;
  wish?: string | null; category?: string | null; price?: number | null; status: OfficialStatus; phone?: string;
  pay_link?: string | null; name?: string;
};

export const OFFICIAL_FALLBACK: OfficialConfig = {
  enabled: true, channel: 'Sortirovka Official', subscribers: '30 000',
  intro: 'В Sortirovka Official — 30 000 живых подписчиков, жителей Сортировки. Покажем ваше объявление местной аудитории: потенциальным клиентам, покупателям, арендаторам или сотрудникам.',
  categories: [
    { code: 'business', title: 'Бизнес', price: 5000, description: 'Реклама компаний, магазинов, кафе, салонов, заведений, а также их товаров, акций и специальных предложений.' },
    { code: 'services', title: 'Недвижимость и услуги', price: 3000, description: 'Продажа и сдача в аренду квартир, домов, комнат и коммерческих помещений. Услуги частных специалистов: ремонт, уборка, перевозки, обучение, красота и другие.' },
    { code: 'private', title: 'Вакансии и частные объявления', price: 1500, description: 'Поиск сотрудников, поиск работы, продажа личных вещей и другие разовые частные объявления.' },
  ],
};

/** Which paid category fits an ad kind best (the owner confirms it anyway). */
export function guessCategory(kind?: string | null): OfficialCategory['code'] {
  if (kind === 'rent' || kind === 'services') return 'services';
  return 'private';
}

export const tenge = (n?: number | null) => `${Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ')} тг`;

function base() { return `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/official-ads`; }
function adminToken() {
  try { return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || getAccountToken() || ''; } catch { return getAccountToken() || ''; }
}

async function call<T>(path: string, init: RequestInit = {}, token = getAccountToken()): Promise<T> {
  const r = await fetch(`${base()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail; else if (Array.isArray(j.detail)) msg = 'Проверьте текст: нужно хотя бы 10 символов'; } catch { /* plain */ }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return r.json() as Promise<T>;
}

export const officialAds = {
  config: () => call<OfficialConfig>('/config'),
  create: (body: { body: string; photos: string[]; phone?: string; name?: string; ann_id?: number | null; wish?: string }) =>
    call<OfficialRequest>('/requests', { method: 'POST', body: JSON.stringify(body) }),
  mine: () => call<{ items: OfficialRequest[] }>('/requests/mine'),
  adminSettings: () => call<OfficialConfig>('/admin/settings', {}, adminToken()),
  adminSave: (cfg: OfficialConfig) => call<OfficialConfig>('/admin/settings', { method: 'PUT', body: JSON.stringify(cfg) }, adminToken()),
  adminRequests: () => call<{ items: OfficialRequest[] }>('/admin/requests', {}, adminToken()),
  adminAction: (id: number, action: 'price' | 'paid' | 'published' | 'reject', category?: string) =>
    call<{ answer: string; item: OfficialRequest }>(`/admin/requests/${id}`, { method: 'POST', body: JSON.stringify({ action, category }) }, adminToken()),
};

export const STATUS_INFO: Record<OfficialStatus, { ru: string; kz: string; hint: { ru: string; kz: string }; tone: string }> = {
  new: { ru: 'На проверке', kz: 'Тексерілуде', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    hint: { ru: 'Смотрим объявление и подбираем категорию. Ответ с суммой придёт в WhatsApp.', kz: 'Хабарландыруды қарап, санатын таңдаймыз. Сомасы WhatsApp-қа келеді.' } },
  priced: { ru: 'Ожидает оплаты', kz: 'Төлем күтілуде', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    hint: { ru: 'Проверено. Оплатите по ссылке Kaspi — и мы опубликуем.', kz: 'Тексерілді. Kaspi сілтемесі арқылы төлеңіз — жариялаймыз.' } },
  paid: { ru: 'Оплачено', kz: 'Төленді', tone: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    hint: { ru: 'Спасибо! Готовим публикацию в канале.', kz: 'Рахмет! Арнада жариялауға дайындап жатырмыз.' } },
  published: { ru: 'Опубликовано', kz: 'Жарияланды', tone: 'bg-green-600 text-white',
    hint: { ru: 'Объявление уже в Sortirovka Official.', kz: 'Хабарландыру Sortirovka Official-да.' } },
  rejected: { ru: 'Не подошло', kz: 'Сәйкес келмеді', tone: 'bg-gray-200 text-gray-700 dark:bg-slate-800 dark:text-slate-300',
    hint: { ru: 'Это объявление не можем разместить. Подробности — в WhatsApp.', kz: 'Бұл хабарландыруды орналастыра алмаймыз. Толығы — WhatsApp-та.' } },
};
