import {apiUrl} from './config';
import {foodOperations} from './foodOperations';

export type ModifierOption = {id: number; name: string; price: number; group_id?: number; is_active?: boolean; archived_at?: string | null; sort_order?: number};
export type ModifierGroup = {id: number; name: string; type: string; min_select: number; max_select: number; is_required: boolean; is_active?: boolean; archived_at?: string | null; sort_order?: number; menu_version?: number; options: ModifierOption[]};
export type Component = {item_id: number; quantity: number; name?: string; available?: boolean; surcharge?: number};
export type ChoiceGroup = {id: string; name: string; min_select: number; max_select: number; options: Component[]};
export type Combo = {components: Component[]; groups: ChoiceGroup[]};
export type MenuProduct = {id: number; name: string; price: number; description?: string; image_url?: string; category_id?: number | null; is_combo?: boolean; modifiers_enabled?: boolean | null; modifier_groups?: ModifierGroup[]; modifier_group_ids?: number[]; combo?: Combo | null; combo_config?: Combo | null; is_active?: boolean; available?: boolean; sellable?: boolean; archived_at?: string | null; unavailable_reasons?: string[]; sort_order?: number; menu_version?: number; is_popular?: boolean; weight?: string};
export type MenuCatalog = {restaurant_id: number; products: MenuProduct[]; groups: ModifierGroup[]; options: ModifierOption[]; categories: {id: number; name: string}[]; links: {food_item_id: number; modifier_group_id: number; id: number; sort_order: number}[]};
export type MenuSelection = {modifiers: {option_id: number; quantity?: number}[]; choices: {group_id: string; item_id: number}[]};
export type LineSnapshot = {id: number; name: string; price: number; base_price: number; quantity: number; modTotal: number; choiceTotal: number; sum: number; modifiers: {option_id: number; group_id: number; name: string; price: number; quantity: number}[]; choices: MenuSelection['choices']; combo_components: {name: string; quantity: number; group_name?: string; surcharge?: number}[]};
export const emptySelection = (): MenuSelection => ({modifiers: [], choices: []});
export const activeGroups = (p: MenuProduct) => p.modifiers_enabled === false ? [] : (p.modifier_groups || []).filter(g => g.is_active !== false && !g.archived_at);
export const needsSelection = (p: MenuProduct) => activeGroups(p).some(g => g.options.some(o => o.is_active !== false && !o.archived_at)) || !!p.combo?.groups.length;
export const menuMoney = (v: number) => Number(v || 0).toLocaleString('ru-RU', {maximumFractionDigits: 2}) + ' ₸';
export async function publicMenu(): Promise<MenuCatalog> {
  const r = await fetch(apiUrl('/api/v1/dam-alem/menu/catalog'), {cache: 'no-store'});
  if (!r.ok) throw Object.assign(new Error('Не удалось загрузить меню'),{status:r.status});
  return r.json();
}
export const ownerMenu = <T,>(path: string, method = 'GET', body?: unknown) => foodOperations<T>(path, method, body, 'menu');
export async function quoteMenuLine(product: MenuProduct, selection: MenuSelection, quantity = 1): Promise<LineSnapshot> {
  const r = await fetch(apiUrl('/api/v1/dam-alem/menu/line-quote'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: product.id, quantity, ...selection})});
  const v = await r.json();
  if (!r.ok) throw new Error(typeof v.detail === 'string' ? v.detail : 'Проверьте состав заказа');
  return v.item;
}
export function selectionErrors(p: MenuProduct, selection: MenuSelection): string[] {
  const errors: string[] = [];
  activeGroups(p).forEach(g => {
    const count = selection.modifiers.filter(m => g.options.some(o => o.id === m.option_id && o.is_active !== false && !o.archived_at)).reduce((a,m) => a + (m.quantity || 1), 0);
    if (count < Math.max(g.min_select || 0, g.is_required ? 1 : 0) || count > g.max_select) errors.push(`${g.name}: выберите от ${Math.max(g.min_select || 0, g.is_required ? 1 : 0)} до ${g.max_select}`);
  });
  (p.combo?.groups || []).forEach(g => {
    const count = selection.choices.filter(c => c.group_id === g.id && g.options.some(o => o.item_id === c.item_id && o.available !== false)).length;
    if (count < g.min_select || count > g.max_select) errors.push(`${g.name}: выберите от ${g.min_select} до ${g.max_select}`);
  });
  return errors;
}
export function estimateSelection(p: MenuProduct, selection: MenuSelection): number {
  return Number(p.price) + selection.modifiers.reduce((sum,m) => sum + Number(activeGroups(p).flatMap(g=>g.options).find(o=>o.id===m.option_id)?.price || 0) * (m.quantity || 1),0)
    + selection.choices.reduce((sum,c)=>sum+Number(p.combo?.groups.find(g=>g.id===c.group_id)?.options.find(o=>o.item_id===c.item_id)?.surcharge || 0),0);
}
