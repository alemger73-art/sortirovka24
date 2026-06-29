import type { ModuleKey } from '@/config/modules';

export type CabinetTabId =
  | 'profile'
  | 'addresses'
  | 'bonuses'
  | 'notifications'
  | 'orders'
  | 'masterRequests'
  | 'taxi'
  | 'complaints'
  | 'announcements'
  | 'realEstate'
  | 'settings';

type CabinetTabRule =
  | { kind: 'always' }
  | { kind: 'module'; key: ModuleKey }
  | { kind: 'anyModule'; keys: ModuleKey[] }
  | { kind: 'taxi' };

/** Delivery-related tabs: any of these modules keeps addresses/orders visible. */
export const DELIVERY_MODULE_KEYS: ModuleKey[] = ['food', 'gastronom', 'volna'];

/** Order history can also come from store partners. */
export const ORDER_MODULE_KEYS: ModuleKey[] = [
  ...DELIVERY_MODULE_KEYS,
  'pharmacy',
  'prorab',
];

export const CABINET_TAB_RULES: Record<CabinetTabId, CabinetTabRule> = {
  profile: { kind: 'always' },
  addresses: { kind: 'anyModule', keys: DELIVERY_MODULE_KEYS },
  bonuses: { kind: 'always' },
  notifications: { kind: 'always' },
  orders: { kind: 'anyModule', keys: ORDER_MODULE_KEYS },
  masterRequests: { kind: 'module', key: 'masters' },
  taxi: { kind: 'taxi' },
  complaints: { kind: 'module', key: 'complaints' },
  announcements: { kind: 'module', key: 'announcements' },
  realEstate: { kind: 'module', key: 'real_estate' },
  settings: { kind: 'always' },
};

export interface CabinetTabVisibilityContext {
  isEnabled: (key: ModuleKey) => boolean;
  taxiEnabled: boolean | null;
  /** When a module is off, keep the tab if the user already has data there. */
  hasData: Partial<Record<CabinetTabId, boolean>>;
}

export function isCabinetTabModuleOn(
  tabId: CabinetTabId,
  ctx: Pick<CabinetTabVisibilityContext, 'isEnabled' | 'taxiEnabled'>,
): boolean {
  const rule = CABINET_TAB_RULES[tabId];
  if (rule.kind === 'always') return true;
  if (rule.kind === 'module') return ctx.isEnabled(rule.key);
  if (rule.kind === 'anyModule') return rule.keys.some((key) => ctx.isEnabled(key));
  if (rule.kind === 'taxi') return ctx.taxiEnabled !== false;
  return true;
}

export function isCabinetTabVisible(
  tabId: CabinetTabId,
  ctx: CabinetTabVisibilityContext,
): boolean {
  if (isCabinetTabModuleOn(tabId, ctx)) return true;
  return Boolean(ctx.hasData[tabId]);
}

export function anyModuleEnabled(
  keys: ModuleKey[],
  isEnabled: (key: ModuleKey) => boolean,
): boolean {
  return keys.some((key) => isEnabled(key));
}
