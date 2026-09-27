import { apiUrl } from './config';

export type PartnerWork = { title: string; image: string; source: string; kind: 'photo' | 'video'; caption: string };
export type PartnerProfile = {
  slug: string; name: string; category: string; headline: string; description: string;
  logo: string; cover: string; phone: string; whatsapp: string; instagram: string;
  address: string; area: string; hours: string; offer: string; offer_terms: string;
  services: string[]; works: PartnerWork[]; published: boolean;
};
export const emptyPartner: PartnerProfile = {
  slug: '', name: '', category: '', headline: '', description: '', logo: '', cover: '',
  phone: '', whatsapp: '', instagram: '', address: '', area: '', hours: '', offer: '',
  offer_terms: '', services: [], works: [], published: false,
};
async function request<T>(path: string, admin = false, body?: PartnerProfile): Promise<T> {
  const token = admin ? localStorage.getItem('_sp924_token') : null;
  const response = await fetch(apiUrl(`/api/v1/partners${path}`), {
    method: body ? 'PUT' : 'GET',
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
  list: (admin = false) => request<{items: PartnerProfile[]}>(admin ? '/admin' : '', admin),
  get: (slug: string) => request<PartnerProfile>(`/${encodeURIComponent(slug)}`),
  save: (profile: PartnerProfile) => request<PartnerProfile>(`/admin/${encodeURIComponent(profile.slug)}`, true, profile),
};
