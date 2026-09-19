import { moduleForPath, MODULE_KEYS, type ModuleKey } from '@/config/modules';

export function notificationVisible(
  item: { path?: string | null; entity_type?: string | null; category?: string | null },
  isEnabled: (key: ModuleKey) => boolean,
  taxi: boolean | null,
): boolean {
  const path = (item.path || '').split('?')[0];
  const source = (item.entity_type || item.category || '').replace(/_orders$/, '');
  if (source === 'taxi' || source === 'taxi_rides' || path.startsWith('/taxi/')) return taxi === true;
  const aliases: Record<string, ModuleKey> = { master: 'masters', master_requests: 'masters', become_master_requests: 'masters', park: 'food', logistics_tasks: 'food', logistics: 'food' };
  const module = moduleForPath(path) || aliases[source] || (MODULE_KEYS.includes(source as ModuleKey) ? source as ModuleKey : null);
  return !module || isEnabled(module);
}
