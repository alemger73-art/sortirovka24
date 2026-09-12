
export interface Coverage { street: string; houses: string }
export interface Inspector {
  id: number; full_name: string; position?: string; photo_url?: string; precinct_number?: string;
  district?: string; address?: string; schedule?: string; phone?: string; whatsapp?: string;
  streets?: string; coverage?: string; description?: string; is_leadership?: boolean; leadership_order?: number;
}
export interface DirectoryTip { title: string; body: string; source_url: string }
export interface DirectoryData {
  revision: number; department_name: string; address: string; duty_phone: string; duty_whatsapp: string;
  map_url: string; reception_schedule: string; source_url: string; verified_on: string | null; notice: string; tips: DirectoryTip[];
}
export const emptyDirectory: DirectoryData = { revision: 0, department_name: '', address: '', duty_phone: '', duty_whatsapp: '', map_url: '', reception_schedule: '', source_url: '', verified_on: null, notice: '', tips: [] };

export function phoneDigits(value = ''): string {
  if (!/^[+\d\s()-]+$/.test(value)) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}
export function phoneHref(value = ''): string { const digits=phoneDigits(value); return digits ? `tel:${digits.length > 10 ? '+' : ''}${digits}` : ''; }
export function safeHttps(value = ''): string {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function coverageRows(inspector: Inspector): Coverage[] {
  try {
    const parsed: unknown = JSON.parse(inspector.coverage || '[]');
    if (Array.isArray(parsed)) {
      const rows = parsed.filter((r): r is Coverage => !!r && typeof r === 'object' && typeof r.street === 'string' && typeof r.houses === 'string' && !!r.street.trim());
      if (rows.length) return rows;
    }
  } catch { /* Older cards retain their plain street list. */ }
  return (inspector.streets || '').split(/[,;\n]/).map(street => ({ street: street.trim(), houses: '' })).filter(r => r.street);
}
export function normalizeStreet(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\b(?:street)\b/g,'').replace(/(^|\s)(?:улица|ул|проспект|пр|дом|д)(?:\.\s*|\s+|$)/g,' ').replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
}
// Only explicit numbers/ranges are authoritative. Unrecognised prose is never a confirmed match.
export function matchesHouse(rule: string, house: string): boolean | null {
  const clean = rule.toLowerCase().replace(/ё/g,'е').trim();
  if (/^(все|все дома|барлық үйлер)$/.test(clean)) return true;
  const h = house.toLowerCase().replace(/\s/g,'');
  const tokens = clean.split(/[,;]/).map(x => x.trim()).filter(Boolean);
  let understood = tokens.length > 0;
  for (const token of tokens) {
    if (/^\d+[а-яa-z]?(?:\/\d+)?$/.test(token)) { if (token === h) return true; continue; }
    const range = token.match(/^(\d+)\s*[-–]\s*(\d+)(?:\s*\((четные|нечетные)\))?$/);
    if (range) {
      if (/^\d+$/.test(h)) {
        const n=Number(h), a=Number(range[1]), b=Number(range[2]);
        if (n >= a && n <= b && (!range[3] || n%2 === (range[3] === 'четные' ? 0 : 1))) return true;
      }
      continue;
    }
    understood = false;
  }
  return understood ? false : null;
}
export function findInspector(ins: Inspector, street: string, house: string): 'confirmed' | 'possible' | false {
  const query = normalizeStreet(street);
  if (!query) return 'possible';
  const rows = coverageRows(ins).filter(row => normalizeStreet(row.street).includes(query));
  if (!rows.length) return false;
  if (!house.trim()) return 'possible';
  if (rows.some(row => normalizeStreet(row.street) === query && matchesHouse(row.houses,house.trim()) === true)) return 'confirmed';
  if (rows.some(row => matchesHouse(row.houses,house.trim()) !== false)) return 'possible';
  return false;
}
