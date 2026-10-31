/** Admin API: paid services the site depends on and their payment dates (reminders go to Telegram). */
import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

export type PaidPeriod = 'month' | 'quarter' | 'year' | 'once';
export type PaidCurrency = 'KZT' | 'USD' | 'EUR' | 'RUB';
export type PaidService = {
  id: number; name: string; amount: number; currency: PaidCurrency; period: PaidPeriod; due_date: string;
  pay_url: string; note: string; active: boolean; days_left: number | null; price: string;
};
export type PaidServiceInput = Omit<PaidService, 'id' | 'days_left' | 'price'>;
export type PaidOverview = {
  items: PaidService[]; today: string; chat: { id: number; title: string } | null; bot: boolean; monthly: string[];
  cert: { host: string; days: number; checked: string } | null;
  log: { name: string; due_date: string; price: string; paid_by: string; paid_at: string }[];
};

export const PERIODS: Record<PaidPeriod, string> = { month: 'Каждый месяц', quarter: 'Раз в квартал', year: 'Раз в год', once: 'Один раз' };
export const CURRENCIES: PaidCurrency[] = ['KZT', 'USD', 'EUR', 'RUB'];

function token() {
  try { return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || getAccountToken() || ''; } catch { return getAccountToken() || ''; }
}
async function call<T>(path = '', init: RequestInit = {}): Promise<T> {
  const t = token();
  const r = await fetch(`${getAPIBaseURL().replace(/\/$/, '')}/api/v1/paid-services${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
  if (!r.ok) {
    let msg = r.status >= 500 ? 'Сервер не ответил, попробуйте ещё раз' : `Ошибка ${r.status}`;
    try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* plain */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export const paidApi = {
  list: () => call<PaidOverview>(),
  create: (s: PaidServiceInput) => call<PaidOverview>('', { method: 'POST', body: JSON.stringify(s) }),
  update: (id: number, s: PaidServiceInput) => call<PaidOverview>(`/${id}`, { method: 'PUT', body: JSON.stringify(s) }),
  remove: (id: number) => call<PaidOverview>(`/${id}`, { method: 'DELETE' }),
  paid: (id: number) => call<PaidOverview & { answer: string }>(`/${id}/paid`, { method: 'POST' }),
  test: () => call<{ ok: boolean }>('/test', { method: 'POST' }),
};

export function dueLabel(days: number | null): { text: string; tone: 'red' | 'amber' | 'green' | 'gray' } {
  if (days === null) return { text: 'Дата не указана', tone: 'gray' };
  if (days < 0) return { text: `Просрочено на ${-days} дн.`, tone: 'red' };
  if (days === 0) return { text: 'Сегодня', tone: 'red' };
  if (days === 1) return { text: 'Завтра', tone: 'amber' };
  if (days <= 7) return { text: `Через ${days} дн.`, tone: 'amber' };
  return { text: `Через ${days} дн.`, tone: 'green' };
}
