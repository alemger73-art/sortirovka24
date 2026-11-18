/** «Полезно знать»: cards about changes that touch residents — API client. */
import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

export type UsefulTeaser = { slug: string; title: string; summary: string; badge: string; category: string; image_url: string; created_at: string };
export type UsefulPoll = { question: string; options: string[] };
export type UsefulResults = { counts: number[]; total: number; mine: number | null };
export type UsefulCard = UsefulTeaser & {
  changes: string[]; actions: string[]; phones: { number: string; label: string }[];
  source: { title: string; url: string } | null; poll: UsefulPoll | null; poll_results: UsefulResults;
  discussion_post_id: number | null;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccountToken();
  const res = await fetch(`${getAPIBaseURL()}/api/v1/useful${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.detail || 'Не удалось загрузить'), { status: res.status });
  return data as T;
}

export const useful = {
  list: () => call<{ items: UsefulTeaser[] }>('').then(r => r.items),
  get: (slug: string) => call<UsefulCard>(`/${encodeURIComponent(slug)}`),
  vote: (slug: string, choice: number) => call<UsefulResults>(`/${encodeURIComponent(slug)}/vote`, { method: 'POST', body: JSON.stringify({ choice }) }),
};

export function percent(results: UsefulResults, index: number): number {
  return results.total ? Math.round((results.counts[index] || 0) * 100 / results.total) : 0;
}
