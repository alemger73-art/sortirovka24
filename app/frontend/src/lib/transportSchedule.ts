import { httpsLink } from './directoryContent';
export type DirectionKey = 'outbound' | 'inbound';
export type DayKey = 'weekday' | 'saturday' | 'sunday';
export interface DaySchedule { times: string; first: string; last: string; interval: string; not_running: boolean }
export interface Direction { stops: string[]; weekday: DaySchedule; saturday: DaySchedule; sunday: DaySchedule }
export type Journey = Record<DirectionKey, Direction>;
export interface BusRoute { id: number; route_number: string; route_name: string; description?: string; is_active?: boolean; sort_order?: number; journey_json?: string; source_url?: string; verified_at?: string; map_url?: string }
export interface BusNotice { id: number; route_id?: number | null; message: string; is_active: boolean }
export const officialTransportUrl = 'https://karaganda.onay.kz/ru';
export const newDay = (): DaySchedule => ({times:'',first:'',last:'',interval:'',not_running:false});
export const newDirection = (): Direction => ({stops:[],weekday:newDay(),saturday:newDay(),sunday:newDay()});
export const newJourney = (): Journey => ({outbound:newDirection(),inbound:newDirection()});
export function readJourney(value?: string): Journey {
  const result = newJourney();
  try { const raw = JSON.parse(value || '{}');
    for (const direction of ['outbound','inbound'] as const) {
      const entry = raw[direction]; if (!entry) continue;
      result[direction].stops = Array.isArray(entry.stops) ? entry.stops.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim()) : [];
      for (const day of ['weekday','saturday','sunday'] as const) { const schedule = entry[day]; if (!schedule) continue; result[direction][day] = { ...newDay(), ...Object.fromEntries(['times','first','last','interval'].map(key => [key, typeof schedule[key] === 'string' ? schedule[key] : ''])), not_running:schedule.not_running === true }; }
    }
  } catch { /* Legacy rows remain available in admin for review. */ }
  return result;
}
export function departureTimes(value: string): string[] | null {
  if (!value.trim()) return [];
  const times = value.trim().split(/[\s,;]+/);
  return times.every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) && new Set(times).size === times.length ? times : null;
}
export function journeyError(journey: Journey): string {
  for (const direction of Object.values(journey)) for (const day of [direction.weekday,direction.saturday,direction.sunday]) {
    if (departureTimes(day.times) === null) return 'Время отправления: ЧЧ:ММ через пробел или запятую, без повторов.';
    if ([day.first,day.last].some(t => t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return 'Проверьте время первого и последнего рейса.';
    if (day.not_running && (day.times || day.first || day.last || day.interval)) return 'Если рейсов нет, очистите время и интервал для этого дня.';
    if (day.times && (day.first || day.last || day.interval)) return 'Укажите либо точные отправления, либо первый / последний рейс и интервал.';
    if ((day.first || day.last || day.interval) && (!day.first || !day.last)) return 'Для интервального расписания нужны первый и последний рейс.';
  }
  return '';
}
export function verifiedRoute(route: BusRoute): boolean {
  const checked = route.verified_at || ''; const date = new Date(`${checked}T00:00:00Z`);
  return route.is_active === true && !!route.route_number?.trim() && !!route.route_name?.trim() && !!httpsLink(route.source_url) && /^\d{4}-\d{2}-\d{2}$/.test(checked) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === checked && checked <= new Date().toLocaleDateString('sv-SE') && !!route.journey_json && Object.values(readJourney(route.journey_json)).some(d => d.stops.length >= 2) && !journeyError(readJourney(route.journey_json));
}
export function routeMatches(route: BusRoute, query: string): boolean {
  const q = query.toLowerCase().replace(/ё/g,'е').trim(); if (!q) return true;
  const text = [route.route_number,route.route_name,...Object.values(readJourney(route.journey_json)).flatMap(d=>d.stops)].join(' ').toLowerCase().replace(/ё/g,'е');
  return q.split(/\s+/).every(w=>text.includes(w));
}
export function cityDay(): DayKey {
  const day = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Almaty',weekday:'short'}).format(new Date());
  return day === 'Sat' ? 'saturday' : day === 'Sun' ? 'sunday' : 'weekday';
}
