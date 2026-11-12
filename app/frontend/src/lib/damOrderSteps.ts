import type { OperatorOrder } from './foodOperations';

export const isDeliveryOrder = (order: Pick<OperatorOrder, 'delivery_method'>) =>
  ['delivery', 'доставка'].includes(order.delivery_method || '');

/** No courier (couriers are off, or the owner's old switch): the operator takes a delivery the whole way. */
export const operatorRunsDelivery = (order: OperatorOrder) => isDeliveryOrder(order) && !!order.operator_runs_delivery;

/** The status the operator moves the order to next, following the server's status machine:
 *  Новый → Готовится → В пути (delivery) / Готов к выдаче (pickup) → Доставлен / Выдан.
 *  Undefined when the next step is not the operator's (a courier takes the delivery). */
export function nextOrderStatus(order: OperatorOrder): string | undefined {
  const delivery = isDeliveryOrder(order);
  const own = operatorRunsDelivery(order);
  switch (order.status) {
    case 'new': return order.is_future_preorder ? 'confirmed' : 'preparing';
    case 'confirmed': return 'preparing';
    case 'preparing': return own ? 'in_progress' : 'ready';
    case 'ready': return !delivery ? 'done' : own ? 'in_progress' : undefined;
    case 'in_progress': return own ? 'done' : undefined;
    default: return undefined;
  }
}

/** The words on the one big button, in Russian; callers pass them through st() for Kazakh. */
export function nextStepLabel(order: OperatorOrder, target: string): string {
  if (target === 'confirmed') return 'Подтвердить предзаказ';
  if (target === 'preparing') return order.is_future_preorder ? 'Начать предзаказ раньше' : order.status === 'new' ? 'Принять' : 'Начать готовить';
  if (target === 'ready') return 'Готово';
  if (target === 'in_progress') return order.status === 'preparing' ? 'Готово' : 'В путь';
  if (target === 'done') return isDeliveryOrder(order) ? 'Доставлен' : 'Выдан';
  return target;
}

/** The order waits for a Kaspi/Halyk invoice to be paid before cooking (only with the invoice flow switched on). */
export const waitsForPayment = (order: OperatorOrder) => order.workflow_state === 'WAITING_PAYMENT';
