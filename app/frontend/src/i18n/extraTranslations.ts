import type { Translations } from './translations';

/** Dictionaries loaded only with the pages that need them (staff/admin UI stays out of the visitor bundle). */
export const extraTranslations: Translations = {};
export function registerTranslations(dict: Translations) { Object.assign(extraTranslations, dict); }
