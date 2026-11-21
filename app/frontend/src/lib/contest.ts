/** «Новогодняя Сортировка» contest: types and calls (see backend services/contest.py). */
import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

export type Nomination = 'yard' | 'house';
export type Phase = 'off' | 'soon' | 'apply' | 'wait' | 'vote' | 'results';
export type EntryStatus = 'pending' | 'published' | 'rejected';

export interface ContestSettings {
  apply_from: string; apply_to: string; vote_from: string; vote_to: string; prizes_ru: string; prizes_kz: string;
}
export interface PublicEntry {
  id: number; nomination: Nomination; title: string; street: string; about: string; photos: string[];
  place: number | null; votes: number | null; mine: boolean;
}
export interface OwnEntry {
  id: number; nomination: Nomination; title: string; street: string; about: string; photos: string[];
  status: EntryStatus; reason: string; place: number | null;
}
export interface ContestView {
  phase: Phase; settings: ContestSettings; entries: PublicEntry[]; signed_in: boolean;
  mine: { entries: OwnEntry[]; votes: Partial<Record<Nomination, number>> };
}
export interface AdminEntry extends OwnEntry { votes: number; user_name: string; user_phone: string; created_at: string }
export interface AdminView { phase: Phase; settings: ContestSettings & { enabled: boolean }; entries: AdminEntry[] }
export interface EntryInput { nomination: Nomination; title: string; street: string; about: string; photos: string[] }

const base = () => `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/contest`;

export const photoUrl = (key: string) => `${base()}/photos/${key}.jpg`;

function adminToken(): string {
  try { return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || getAccountToken() || ''; } catch { return getAccountToken() || ''; }
}

async function call<T>(path: string, init: RequestInit = {}, token = getAccountToken()): Promise<T> {
  const r = await fetch(`${base()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!r.ok) {
    let msg = r.status >= 500 ? 'Сервер не ответил, попробуйте ещё раз' : `Ошибка ${r.status}`;
    try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail; } catch { /* plain text */ }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return r.json() as Promise<T>;
}
const send = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const contestApi = {
  view: () => call<ContestView>(''),
  uploadPhoto: (image: string) => call<{ key: string }>('/photos', send('POST', { image })),
  submit: (entry: EntryInput) => call<OwnEntry>('/entries', send('POST', entry)),
  withdraw: (id: number) => call<{ ok: boolean }>(`/entries/${id}`, send('DELETE')),
  vote: (entryId: number) => call<{ ok: boolean }>('/vote', send('POST', { entry_id: entryId })),
  admin: {
    view: () => call<AdminView>('/admin', {}, adminToken()),
    settings: (settings: Partial<AdminView['settings']>) => call<AdminView['settings']>('/admin/settings', send('PUT', { settings }), adminToken()),
    entry: (id: number, body: { status?: EntryStatus; reason?: string; place?: number; clear_place?: boolean }) =>
      call<{ ok: boolean }>(`/admin/entries/${id}`, send('POST', body), adminToken()),
  },
};

/** 2026-12-21 → «21 декабря» / «21 желтоқсан». */
export function dayLabel(iso: string, kz: boolean): string {
  const [, m, d] = iso.split('-').map(Number);
  const ru = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const k = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
  return `${d} ${(kz ? k : ru)[m - 1]}`;
}
