/** «Инструкции»: video guides — API client. */
import { getAPIBaseURL } from '@/lib/config';

type GuideText = { title: string; summary: string; video: string; poster: string; duration: string; steps: string[] };
export type GuideLang = 'ru' | 'kz';
/** A guide in Russian, optionally with a Kazakh version of the same video and steps. */
export type Instruction = GuideText & { slug: string; kz?: GuideText };

/** The guide's text and video in the wanted language, falling back to Russian. */
export function inLang(item: Instruction, lang: GuideLang): GuideText {
  return lang === 'kz' && item.kz ? item.kz : item;
}

let cache: Promise<Instruction[]> | null = null;

export function loadInstructions(): Promise<Instruction[]> {
  cache ??= fetch(`${getAPIBaseURL()}/api/v1/instructions`)
    .then(r => (r.ok ? r.json() : { items: [] }))
    .then(d => (d.items || []) as Instruction[])
    .catch(() => { cache = null; return []; });
  return cache;
}
