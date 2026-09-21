export function foodOrderStatusKey(status: string, deliveryMethod?: string): string {
  const pickup = deliveryMethod === 'pickup' || deliveryMethod === 'dine_in';
  if (status === 'ready') return pickup ? 'workflow.readyPickup' : 'workflow.ready';
  if (['done', 'completed', 'delivered'].includes(status)) return pickup ? 'workflow.issued' : 'workflow.done';
  return ({new:'workflow.new', confirmed:'workflow.accepted', preparing:'workflow.preparing',
    in_progress:'workflow.transit', cancelled:'cabinet.orderStatus.cancelled'} as Record<string,string>)[status] || 'workflow.new';
}
