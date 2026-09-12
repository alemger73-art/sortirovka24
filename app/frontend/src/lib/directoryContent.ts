export interface DirectoryEntry {
  id: number; entry_name: string; category: string; phone?: string; address?: string;
  description?: string; sort_order?: number | null; opening_hours?: string;
  website?: string; map_url?: string; whatsapp?: string; source_url?: string;
  verified_at?: string; is_published?: boolean | null;
}
export const emergencySource = 'https://www.gov.kz/situations/729/1519?lang=ru';
export const emergencyContacts = [
  { number: '112', ru: 'Единая служба спасения', kz: 'Бірыңғай құтқару қызметі' },
  { number: '101', ru: 'Пожарные и спасатели', kz: 'Өрт сөндіру және құтқару' },
  { number: '102', ru: 'Полиция', kz: 'Полиция' },
  { number: '103', ru: 'Скорая помощь', kz: 'Жедел жәрдем' },
  { number: '104', ru: 'Аварийная газовая служба', kz: 'Газдың авариялық қызметі' },
];
export function phoneLink(value = ''): string | undefined {
  if (!/^[+\d\s()–-]+$/.test(value)) return;
  let digits = value.replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 15) return;
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  return 'tel:' + (digits.length > 10 ? '+' : '') + digits;
}
export function httpsLink(value = ''): string | undefined {
  try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch { /* Invalid links are not actionable. */ }
}
export function whatsappLink(value = ''): string | undefined {
  const phone = phoneLink(value)?.replace(/\D/g, '');
  return phone && phone.length >= 10 ? `https://wa.me/${phone}` : undefined;
}
// Exact fingerprints of shipped demo rows, not a heuristic about real numbers.
const demoRows = [
  ['Городская поликлиника №3', '+77001234567'], ['Аптека Биосфера', '+77005551234'],
  ['Школа №12 им. Ауэзова', '+77009876543'], ['ЖКХ района Сортировка', '+77212345678'],
  ['ЦОН (Центр обслуживания населения)', '1414'],
];
export function isLegacyDemo(entry: DirectoryEntry): boolean {
  return !entry.source_url && demoRows.some(([name, phone]) => name === entry.entry_name && phone === entry.phone);
}
export function isNationalEmergency(entry: DirectoryEntry): boolean {
  return entry.category === 'Экстренные службы' && emergencyContacts.some(e => phoneLink(entry.phone) === `tel:${e.number}`);
}
export function matchesEntry(entry: DirectoryEntry, query: string, categoryLabel = ''): boolean {
  const normalize = (v: string) => v.toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize([entry.entry_name, entry.address, entry.category, categoryLabel, entry.description, entry.phone].filter(Boolean).join(' '));
  if (/^[+\d\s()–-]+$/.test(q)) return (entry.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
  return q.split(' ').every(word => hay.includes(word));
}

export function readyForDirectory(entry: DirectoryEntry): boolean {
  const date = entry.verified_at || '';
  const parsed = new Date(`${date}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date <= new Date().toLocaleDateString('sv-SE');
  return entry.is_published !== false && !!entry.entry_name?.trim() && !!httpsLink(entry.source_url) && validDate && !!(phoneLink(entry.phone) || httpsLink(entry.website)) && !isLegacyDemo(entry) && !isNationalEmergency(entry);
}
