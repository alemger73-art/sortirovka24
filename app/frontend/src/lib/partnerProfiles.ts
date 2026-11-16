import { apiUrl } from './config';
import { getAccountToken } from './accountApi';

export type PartnerWork = { title: string; image: string; source: string; kind: 'photo' | 'video'; caption: string };
export type PartnerPrice = { title: string; price: string; old_price: string; note: string; includes: string[]; featured: boolean };
export type PartnerFact = { value: string; label: string };
export type PartnerReview = { author: string; text: string; rating: number; date: string; source: string };
export type PartnerFaq = { q: string; a: string };
export type PartnerLeadForm = { enabled: boolean; title: string; note: string; button: string; options: string[] };
export type PartnerProfile = {
  slug: string; name: string; category: string; headline: string; description: string;
  logo: string; cover: string; phone: string; whatsapp: string; instagram: string;
  address: string; area: string; hours: string; offer: string; offer_terms: string;
  services: string[]; works: PartnerWork[];
  prices: PartnerPrice[]; prices_note: string; facts: PartnerFact[]; steps: string[];
  reviews: PartnerReview[]; faq: PartnerFaq[]; lead: PartnerLeadForm;
  featured?: boolean; published: boolean;
};
export type PartnerLead = { id: number; name: string; phone: string; choice: string; comment: string; status: string; accepted_by: string; created_at: string };

export const emptyLeadForm: PartnerLeadForm = { enabled: false, title: 'Оставить заявку', note: '', button: 'Отправить заявку', options: [] };
export const emptyPartner: PartnerProfile = {
  slug: '', name: '', category: '', headline: '', description: '', logo: '', cover: '',
  phone: '', whatsapp: '', instagram: '', address: '', area: '', hours: '', offer: '',
  offer_terms: '', services: [], works: [], prices: [], prices_note: '', facts: [], steps: [],
  reviews: [], faq: [], lead: { ...emptyLeadForm }, featured: false, published: false,
};

/** Pages saved before prices, reviews and the request form existed come without these fields. */
const complete = (p: PartnerProfile): PartnerProfile => ({ ...emptyPartner, ...p, lead: { ...emptyLeadForm, ...(p.lead || {}) } });

async function request<T>(path: string, admin = false, method = 'GET', body?: unknown): Promise<T> {
  // a signed-in resident's request is linked to their account; the admin uses the panel token
  const token = admin ? localStorage.getItem('_sp924_token') : getAccountToken();
  const response = await fetch(apiUrl(`/api/v1/partners${path}`), {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : response.status === 422 ? 'Проверьте обязательные поля, телефон и ссылки.' : 'Не удалось загрузить данные. Попробуйте ещё раз.');
  }
  return response.json();
}

export const partnerProfiles = {
  list: (admin = false) => request<{ items: PartnerProfile[] }>(admin ? '/admin' : '', admin).then(r => ({ items: r.items.map(complete) })),
  get: (slug: string) => request<PartnerProfile>(`/${encodeURIComponent(slug)}`).then(complete),
  save: (profile: PartnerProfile) => request<PartnerProfile>(`/admin/${encodeURIComponent(profile.slug)}`, true, 'PUT', profile),
  sendLead: (slug: string, lead: { name: string; phone: string; choice: string; comment: string }) =>
    request<{ id: number; notified: number }>(`/${encodeURIComponent(slug)}/leads`, false, 'POST', lead),
  telegramLink: (slug: string) => request<{ url: string; linked: number }>(`/admin/${encodeURIComponent(slug)}/telegram-link`, true),
  leads: (slug: string) => request<{ items: PartnerLead[] }>(`/admin/${encodeURIComponent(slug)}/leads`, true),
};
