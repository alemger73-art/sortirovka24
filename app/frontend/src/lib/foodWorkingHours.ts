/** Kitchen open/close helpers for DAM ALEM settings. */

export interface KitchenHours {
  open: string;
  close: string;
}

function extractTimes(value: string): [string, string] | null {
  const matches = [...value.matchAll(/(\d{1,2}):(\d{2})/g)];
  if (matches.length < 2) return null;
  const first = matches[0];
  const last = matches[matches.length - 1];
  const pad = (hours: string, minutes: string) =>
    `${String(Number(hours)).padStart(2, '0')}:${minutes}`;
  return [pad(first[1], first[2]), pad(last[1], last[2])];
}

export function parseKitchenHours(settings: Record<string, string | undefined>): KitchenHours {
  const combined = (settings.working_hours || '').trim();
  const fromCombined = combined ? extractTimes(combined) : null;
  if (fromCombined) return { open: fromCombined[0], close: fromCombined[1] };
  return {
    open: (settings.kitchen_open || '10:00').trim(),
    close: (settings.kitchen_close || '22:00').trim(),
  };
}

function parseHm(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isKitchenOpen(
  settings: Record<string, string | undefined>,
  now = new Date(),
): { open: boolean; opensAt: string; closesAt: string; message?: string } {
  const { open, close } = parseKitchenHours(settings);
  const openMin = parseHm(open);
  const closeMin = parseHm(close);
  if (openMin == null || closeMin == null) {
    return { open: true, opensAt: open, closesAt: close };
  }

  const cur = now.getHours() * 60 + now.getMinutes();
  let openNow = false;
  if (closeMin > openMin) {
    openNow = cur >= openMin && cur < closeMin;
  } else {
    // overnight e.g. 22:00 - 02:00
    openNow = cur >= openMin || cur < closeMin;
  }

  if (openNow) {
    return { open: true, opensAt: open, closesAt: close };
  }
  return {
    open: false,
    opensAt: open,
    closesAt: close,
    message: `Приём заказов с ${open} до ${close}`,
  };
}
