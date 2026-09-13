import { getPublicLanguage } from '@/i18n/publicLocale';

/** Localize system errors without changing arbitrary server messages. */
export function humanizeApiError(err: unknown): string {
  const kz = getPublicLanguage() === 'kz';
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
    return (kz ? "Сервермен байланыс жоқ. Интернетті тексеріп, қайталап көріңіз." : "Нет связи с сервером. Проверьте интернет и попробуйте снова.");
  }
  if (lower.includes('http 401') || lower.includes('session expired') || lower.includes('unauthorized')) {
    return (kz ? "Сеанс аяқталды. Қайта кіріңіз." : "Сессия истекла. Войдите снова.");
  }
  if (lower.includes('http 413')) {
    return (kz ? "Файл тым үлкен. 20 МБ-тан аспайтын суретті таңдаңыз." : "Файл слишком большой. Выберите фото до 20 МБ.");
  }
  if (lower.includes('http 503') || lower.includes('http 502')) {
    return (kz ? "Сервер уақытша қолжетімсіз. Бір минуттан кейін қайталап көріңіз." : "Сервер временно недоступен. Попробуйте через минуту.");
  }

  return raw || (kz ? "Қате пайда болды. Қайталап көріңіз." : "Произошла ошибка. Попробуйте ещё раз.");
}
