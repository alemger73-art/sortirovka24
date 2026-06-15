/** Map low-level fetch/network errors to user-friendly Russian messages. */
export function humanizeApiError(err: unknown): string {
  const raw = String((err as Error)?.message || err || '').trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('econnreset') ||
    lower.includes('timeout') ||
    lower.includes('aborted')
  ) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  }
  if (lower.includes('http 401') || lower.includes('session expired') || lower.includes('unauthorized')) {
    return 'Сессия истекла. Войдите снова.';
  }
  if (lower.includes('http 413')) {
    return 'Файл слишком большой. Выберите фото до 20 МБ.';
  }
  if (lower.includes('http 503') || lower.includes('http 502')) {
    return 'Сервер временно недоступен. Попробуйте через минуту.';
  }

  return raw || 'Произошла ошибка. Попробуйте ещё раз.';
}
