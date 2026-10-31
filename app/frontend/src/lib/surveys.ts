/** Опросы за бонусы: API client for residents and for the admin panel. */
import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

export type QuestionType = 'single' | 'multi' | 'scale' | 'text' | 'check';
export type Question = {
  id: string; type: QuestionType; text: string; required: boolean;
  options?: string[]; other?: boolean; low?: string; high?: string; answer?: number;
};
export type Answer = { choices?: number[]; other?: string; value?: number; text?: string };
export type SurveyCard = { id: number; title: string; intro: string; questions: number; minutes: number; reward: number; places_left: number | null; done: boolean };
export type SurveyOpen = { id: number; title: string; intro: string; questions: Question[]; reward: number; done: boolean; phone_verified: boolean; bonus_days: number };
export type SubmitResult = { ok: boolean; rewarded: number; valid: boolean; message: string };

export type SurveyStatus = 'draft' | 'active' | 'closed';
export type AdminSurvey = {
  id: number; title: string; intro: string; questions: Question[]; reward: number; max_rewards: number | null; status: SurveyStatus;
  created_at: string; started_at: string | null; closed_at: string | null;
  counts: { total: number; valid: number; rewarded: number }; bonus_spent: number;
};
export type SurveyInput = Pick<AdminSurvey, 'title' | 'intro' | 'questions' | 'reward' | 'max_rewards'>;
export type ResultQuestion = {
  id: string; type: QuestionType; text: string; answered: number;
  options?: { label: string; count: number }[]; texts?: string[]; average?: number | null; low?: string; high?: string;
};
export type SurveyResults = {
  survey: { id: number; title: string; status: SurveyStatus; reward: number; max_rewards: number | null };
  counts: { total: number; valid: number; rewarded: number }; rejected: { too_fast: number; check_failed: number };
  questions: ResultQuestion[];
};

const base = () => `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/surveys`;
function adminToken() {
  try { return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || getAccountToken() || ''; } catch { return getAccountToken() || ''; }
}
async function call<T>(path: string, init: RequestInit = {}, token = getAccountToken()): Promise<T> {
  const r = await fetch(`${base()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!r.ok) {
    let msg = r.status >= 500 ? 'Сервер не ответил, попробуйте ещё раз' : `Ошибка ${r.status}`;
    try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* plain */ }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return r.json() as Promise<T>;
}
const send = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const surveyApi = {
  list: () => call<{ items: SurveyCard[] }>(''),
  open: (id: number) => call<SurveyOpen>(`/${id}`),
  submit: (id: number, answers: Record<string, Answer>) => call<SubmitResult>(`/${id}`, send('POST', { answers })),
  admin: {
    list: () => call<{ items: AdminSurvey[] }>('/admin', {}, adminToken()),
    create: (s: SurveyInput) => call<{ items: AdminSurvey[] }>('/admin', send('POST', s), adminToken()),
    update: (id: number, s: SurveyInput) => call<{ items: AdminSurvey[] }>(`/admin/${id}`, send('PUT', s), adminToken()),
    status: (id: number, status: SurveyStatus) => call<{ items: AdminSurvey[] }>(`/admin/${id}/status`, send('POST', { status }), adminToken()),
    remove: (id: number) => call<{ items: AdminSurvey[] }>(`/admin/${id}`, send('DELETE'), adminToken()),
    results: (id: number) => call<SurveyResults>(`/admin/${id}/results`, {}, adminToken()),
    async csv(id: number) {
      const r = await fetch(`${base()}/admin/${id}/results.csv`, { headers: { Authorization: `Bearer ${adminToken()}` } });
      if (!r.ok) throw new Error('Не удалось скачать файл');
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `opros-${id}-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  },
};

/** Whether a question has an answer the server will accept. */
export function answered(q: Question, a: Answer | undefined): boolean {
  if (!a) return false;
  if (q.type === 'scale') return typeof a.value === 'number';
  if (q.type === 'text') return Boolean(a.text?.trim());
  return Boolean(a.choices?.length || a.other?.trim());
}
