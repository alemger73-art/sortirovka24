import adminTranslations from '@/i18n/adminTranslations';
import { getPublicLanguage } from '@/i18n/publicLocale';
import { getAPIBaseURL } from './config';
import { getPartnerToken } from './partnerAuthApi';

export async function foodOperations<T>(path: string, method = 'GET', body?: unknown, area: 'operations' | 'business' | 'payroll' = 'operations'): Promise<T> {
  const partner = getPartnerToken('dam_alem');
  const admin = localStorage.getItem('_sp924_token') || localStorage.getItem('token');
  const token = location.pathname.startsWith('/partner/') ? partner : admin || partner;
  const response = await fetch(`${getAPIBaseURL()}/api/v1/dam-alem/${area}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : adminTranslations['admin.dam.operationError'][getPublicLanguage()]);
  return data;
}

export interface OperatorOrder {
  order_source?: string | null;
  paid_amount?: number | null; receipt_revision?: number;
  id: number; version: number | null; status: string; customer_name: string; customer_phone: string;
  delivery_method: string; delivery_address: string; order_items: string; total_amount: number;
  payment_method: string; payment_status: string; comment: string; created_at: string;
  operator_note: string | null; cancellation_reason: string | null;
}
export interface OrderEvent { id: number; actor: string; message: string; created_at: string; notification: string; error: string | null }
export interface OrderDelivery {
  id: number; status: string; courier_name: string | null; courier_phone: string | null;
  picked_up_at: string | null; delivered_at: string | null;
}
export interface OrderDetail { order: OperatorOrder; events: OrderEvent[]; delivery: OrderDelivery | null }
export const orderLabels: Record<string, string> = { new: 'Новый', confirmed: 'Принят', preparing: 'Готовится', ready: 'Готов к выдаче', in_progress: 'В доставке', done: 'Завершён', cancelled: 'Отменён' };

export const foodBusiness = <T,>(path: string, method = 'GET', body?: unknown) => foodOperations<T>(path, method, body, 'business');
