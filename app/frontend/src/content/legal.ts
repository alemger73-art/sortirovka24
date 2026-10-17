import { documents, operator, legalVersion } from './legal-data.mjs';
export type LegalDocument = { title: string; updated: string; version: string; sections: { heading: string; body: string }[] };
export type LegalDocKey = 'terms' | 'privacy' | 'consent' | 'food-terms';
export const LEGAL_VERSION = legalVersion as string;
export const LEGAL_OPERATOR = operator;
export function getLegalDocuments(language = 'ru'): Record<LegalDocKey, LegalDocument> { return documents[language === 'kz' ? 'kz' : 'ru']; }
export const USER_AGREEMENT = getLegalDocuments().terms;
export const PRIVACY_POLICY = getLegalDocuments().privacy;
