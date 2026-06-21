import { apiUrl } from './config';

export interface BusinessApplyPayload {
  name: string;
  phone: string;
  whatsapp?: string;
  activity: string;
  description?: string;
}

export async function submitBusinessApplication(payload: BusinessApplyPayload): Promise<void> {
  const res = await fetch(apiUrl('/api/v1/business/apply'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `HTTP ${res.status}`);
  }
}
