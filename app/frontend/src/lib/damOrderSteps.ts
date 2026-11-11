import type { OperatorOrder } from './foodOperations';

const NEXT: Record<string, string> = { new: 'preparing', confirmed: 'preparing', preparing: 'ready' };

export const isDeliveryOrder = (order: Pick<OperatorOrder, 'delivery_method'>) =>
  ['delivery', 'доставка'].includes(order.delivery_method || '');

/** The operator runs the delivery himself (owner's switch): no couriers, «Выехал» and «Доставлено» are his buttons. */
export const operatorRunsDelivery = (order: OperatorOrder) => isDeliveryOrder(order) && !!order.operator_runs_delivery;

/** The status the operator moves the order to next, following the server's status machine.
 *  Undefined when the next step is not a plain status change (courier hand-over, courier finishes). */
export function nextOrderStatus(order: OperatorOrder): string | undefined {
  const delivery = isDeliveryOrder(order);
  const operatorDelivery = operatorRunsDelivery(order);
  if (order.status === 'new' && order.is_future_preorder) return 'confirmed';
  if (order.status === 'ready' && !delivery) return 'done';
  if (operatorDelivery && order.status === 'ready') return 'in_progress';
  if (operatorDelivery && order.status === 'in_progress') return 'done';
  return NEXT[order.status];
}

/** «Доставлено» by the operator also records the cash he took from the customer. */
export function collectsCashOnStep(order: OperatorOrder, target: string | undefined): boolean {
  return operatorRunsDelivery(order) && target === 'done' && order.payment_method === 'cash' && order.payment_status !== 'paid';
}
