import { apiUrl } from './config';

export interface BusinessApplyPayload {
  name: string;
  phone: string;
  whatsapp?: string;
  activity: string;
  description?: string;
  contact_name?: string;
  coverage?: string;
  website?: string;
  consent: boolean;
}

export async function submitBusinessApplication(payload: BusinessApplyPayload): Promise<{id: number}> {
  const res = await fetch(apiUrl('/api/v1/business/apply'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Не удалось отправить заявку. Проверьте поля и попробуйте снова.');
  }
  const result = await res.json();
  if (result.success !== true || !Number.isInteger(result.id)) throw new Error('Не удалось подтвердить сохранение заявки.');
  return {id: result.id};
}
