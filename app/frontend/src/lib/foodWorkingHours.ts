/** Kitchen open/close helpers for DAM ALEM settings. */

export interface KitchenHours {
  open: string;
  close: string;
}

export function parseKitchenHours(settings: Record<string, string | undefined>): KitchenHours {
  const combined = (settings.working_hours || '').trim();
  if (combined.includes('-')) {
    const [open, close] = combined.split('-').map(s => s.trim());
    if (open && close) return { open, close };
  }
  return {
    open: (settings.kitchen_open || '10:00').trim(),
    close: (settings.kitchen_close || '22:00').trim(),
  };
}

function parseHm(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
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
