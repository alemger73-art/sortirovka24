/** «Инструкции»: video guides — API client. */
import { getAPIBaseURL } from '@/lib/config';

export type Instruction = { slug: string; title: string; summary: string; video: string; poster: string; duration: string; steps: string[] };

let cache: Promise<Instruction[]> | null = null;

export function loadInstructions(): Promise<Instruction[]> {
  cache ??= fetch(`${getAPIBaseURL()}/api/v1/instructions`)
    .then(r => (r.ok ? r.json() : { items: [] }))
    .then(d => (d.items || []) as Instruction[])
    .catch(() => { cache = null; return []; });
  return cache;
}
