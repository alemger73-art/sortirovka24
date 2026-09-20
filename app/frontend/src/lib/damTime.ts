const DAM_TIME_ZONE = 'Asia/Almaty';

function parseApiDate(value: string): Date {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

export function formatDamTime(value: string): string {
  return parseApiDate(value).toLocaleTimeString([], {
    timeZone: DAM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDamDateTime(value: string): string {
  return parseApiDate(value).toLocaleString([], {
    timeZone: DAM_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
