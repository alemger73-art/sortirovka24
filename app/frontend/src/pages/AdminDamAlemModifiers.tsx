import { useEffect, useMemo, useState } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { findDamAlemRestaurantId } from '@/lib/damAlem';
import { fetchFoodRestaurantsList } from '@/lib/foodAdminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ModifierGroup {
  id: number;
  name: string;
  type?: string;
  is_required?: boolean;
  min_select?: number;
  max_select?: number;
  sort_order?: number;
  is_active?: boolean;
}

interface ModifierOption {
  id: number;
  group_id: number;
  name: string;
  price?: number;
  sort_order?: number;
  is_active?: boolean;
}

interface ItemLink {
  id: number;
  food_item_id: number;
  modifier_group_id: number;
  sort_order?: number;
}

interface FoodItem {
  id: number;
  name: string;
  restaurant_id?: number | null;
}

const GROUP_TYPES = [
  { value: 'single', label: 'Один вариант' },
  { value: 'multiple', label: 'Несколько' },
  { value: 'quantity', label: 'Количество' },
];

export default function AdminDamAlemModifiers() {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [options, setOptions] = useState<ModifierOption[]>([]);
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

  const [groupDialog, setGroupDialog] = useState<Partial<ModifierGroup> | null>(null);
  const [optionDialog, setOptionDialog] = useState<{ groupId: number; data: Partial<ModifierOption> } | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ groupId: number; itemId: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [restaurants, groupsRes, optionsRes, linksRes, itemsRes] = await Promise.all([
        fetchFoodRestaurantsList(),
        withRetry(() => client.entities.modifier_groups.query({ sort: 'sort_order', limit: 200 })),
        withRetry(() => client.entities.modifier_options.query({ sort: 'sort_order', limit: 1000 })),
        withRetry(() => client.entities.item_modifier_groups.query({ limit: 2000 })),
        withRetry(() => client.entities.food_items.query({ sort: 'sort_order', limit: 2000 })),
      ]);
      const damId = findDamAlemRestaurantId(restaurants);
      setGroups(groupsRes?.data?.items || []);
      setOptions(optionsRes?.data?.items || []);
      setLinks(linksRes?.data?.items || []);
      const allItems: FoodItem[] = itemsRes?.data?.items || [];
      setItems(
        damId != null
          ? allItems.filter(i => i.restaurant_id === damId || i.restaurant_id == null)
          : allItems
      );
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки модификаторов');
    } finally {
      setLoading(false);
    }
  }

  const optionsByGroup = useMemo(() => {
    const map = new Map<number, ModifierOption[]>();
    options.forEach(o => {
      const arr = map.get(o.group_id) || [];
      arr.push(o);
      map.set(o.group_id, arr);
    });
    return map;
  }, [options]);

  const linksByGroup = useMemo(() => {
    const map = new Map<number, ItemLink[]>();
    links.forEach(l => {
      const arr = map.get(l.modifier_group_id) || [];
      arr.push(l);
      map.set(l.modifier_group_id, arr);
    });
    return map;
  }, [links]);

  function itemName(id: number) {
    return items.find(i => i.id === id)?.name || `#${id}`;
  }

  async function saveGroup() {
    if (!groupDialog?.name?.trim()) {
      toast.error('Введите название группы');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: groupDialog.name.trim(),
        type: groupDialog.type || 'single',
        is_required: groupDialog.is_required ?? false,
        min_select: Number(groupDialog.min_select ?? 0),
        max_select: Number(groupDialog.max_select ?? 1),
        sort_order: Number(groupDialog.sort_order ?? groups.length + 1),
        is_active: groupDialog.is_active !== false,
      };
      if (groupDialog.id) {
        await withRetry(() => client.entities.modifier_groups.update({ id: String(groupDialog.id), data }));
      } else {
        await withRetry(() => client.entities.modifier_groups.create({
          data: { ...data, created_at: new Date().toISOString() },
        }));
      }
      toast.success('Группа сохранена');
      invalidateAllCaches();
      setGroupDialog(null);
      await load();
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(id: number) {
    if (!confirm('Удалить группу и все её опции?')) return;
    try {
      const groupOptions = options.filter(o => o.group_id === id);
      for (const o of groupOptions) {
        await withRetry(() => client.entities.modifier_options.delete({ id: String(o.id) }));
      }
      const groupLinks = links.filter(l => l.modifier_group_id === id);
      for (const l of groupLinks) {
        await withRetry(() => client.entities.item_modifier_groups.delete({ id: String(l.id) }));
      }
      await withRetry(() => client.entities.modifier_groups.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      await load();
    } catch {
      toast.error('Ошибка удаления');
    }
  }

  async function saveOption() {
    if (!optionDialog?.data.name?.trim()) {
      toast.error('Введите название опции');
      return;
    }
    setSaving(true);
    try {
      const { groupId, data } = optionDialog;
      const payload = {
        group_id: groupId,
        name: data.name!.trim(),
        price: Number(data.price ?? 0),
        sort_order: Number(data.sort_order ?? (optionsByGroup.get(groupId)?.length || 0) + 1),
        is_active: data.is_active !== false,
      };
      if (data.id) {
        await withRetry(() => client.entities.modifier_options.update({ id: String(data.id), data: payload }));
      } else {
        await withRetry(() => client.entities.modifier_options.create({
          data: { ...payload, created_at: new Date().toISOString() },
        }));
      }
      toast.success('Опция сохранена');
      invalidateAllCaches();
      setOptionDialog(null);
      await load();
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function deleteOption(id: number) {
    if (!confirm('Удалить опцию?')) return;
    try {
      await withRetry(() => client.entities.modifier_options.delete({ id: String(id) }));
      toast.success('Удалено');
      invalidateAllCaches();
      await load();
    } catch {
      toast.error('Ошибка удаления');
    }
  }

  async function addLink() {
    if (!linkDialog?.itemId) {
      toast.error('Выберите блюдо');
      return;
    }
    const foodItemId = parseInt(linkDialog.itemId, 10);
    if (links.some(l => l.modifier_group_id === linkDialog.groupId && l.food_item_id === foodItemId)) {
      toast.error('Эта группа уже привязана к блюду');
      return;
    }
    setSaving(true);
    try {
      await withRetry(() => client.entities.item_modifier_groups.create({
        data: {
          food_item_id: foodItemId,
          modifier_group_id: linkDialog.groupId,
          sort_order: (linksByGroup.get(linkDialog.groupId)?.length || 0) + 1,
          created_at: new Date().toISOString(),
        },
      }));
      toast.success('Привязка добавлена');
      invalidateAllCaches();
      setLinkDialog(null);
      await load();
    } catch {
      toast.error('Ошибка привязки');
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(id: number) {
    try {
      await withRetry(() => client.entities.item_modifier_groups.delete({ id: String(id) }));
      invalidateAllCaches();
      await load();
    } catch {
      toast.error('Ошибка удаления привязки');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF3B30]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Модификаторы блюд</h3>
          <p className="mt-1 text-sm text-gray-500">
            Группы опций (размер, добавки) и привязка к блюдам DAM ALEM 2.0
          </p>
        </div>
        <Button
          size="sm"
          className="bg-[#FF3B30] hover:bg-[#e8352b]"
          onClick={() => setGroupDialog({ name: '', type: 'single', is_required: false, min_select: 0, max_select: 1, is_active: true })}
        >
          <Plus className="mr-1 h-4 w-4" /> Группа
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-gray-500">
          Нет групп модификаторов. Создайте первую — например «Размер пиццы» или «Добавки».
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const expanded = expandedGroup === group.id;
            const groupOptions = optionsByGroup.get(group.id) || [];
            const groupLinks = linksByGroup.get(group.id) || [];
            return (
              <div key={group.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div
                  className="flex cursor-pointer items-center gap-3 p-4 hover:bg-gray-50"
                  onClick={() => setExpandedGroup(expanded ? null : group.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{group.name}</span>
                      {group.is_active === false && <Badge variant="destructive" className="text-xs">Неактивна</Badge>}
                      {group.is_required && <Badge className="bg-orange-100 text-orange-800 text-xs">Обязательная</Badge>}
                      <Badge variant="outline" className="text-xs">{GROUP_TYPES.find(t => t.value === group.type)?.label || group.type}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {groupOptions.length} опций · {groupLinks.length} блюд
                    </p>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => setGroupDialog({ ...group })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteGroup(group.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {expanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t bg-gray-50/50 p-4 space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">Опции</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOptionDialog({ groupId: group.id, data: { name: '', price: 0, is_active: true } })}
                        >
                          <Plus className="mr-1 h-3 w-3" /> Опция
                        </Button>
                      </div>
                      {groupOptions.length === 0 ? (
                        <p className="text-xs text-gray-400">Нет опций</p>
                      ) : (
                        <div className="space-y-1.5">
                          {groupOptions.map(opt => (
                            <div key={opt.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 border">
                              <div>
                                <span className="text-sm font-medium">{opt.name}</span>
                                {opt.price ? <span className="ml-2 text-xs text-gray-500">+{opt.price} ₸</span> : null}
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setOptionDialog({ groupId: group.id, data: { ...opt } })}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteOption(opt.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                          <Link2 className="h-3.5 w-3.5" /> Привязка к блюдам
                        </span>
                        <Button size="sm" variant="outline" onClick={() => setLinkDialog({ groupId: group.id, itemId: '' })}>
                          <Plus className="mr-1 h-3 w-3" /> Блюдо
                        </Button>
                      </div>
                      {groupLinks.length === 0 ? (
                        <p className="text-xs text-gray-400">Не привязано ни к одному блюду</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {groupLinks.map(link => (
                            <Badge key={link.id} variant="secondary" className="gap-1 pr-1">
                              {itemName(link.food_item_id)}
                              <button type="button" className="ml-1 text-red-500 hover:text-red-700" onClick={() => removeLink(link.id)}>×</button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Group dialog */}
      <Dialog open={!!groupDialog} onOpenChange={open => !open && setGroupDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{groupDialog?.id ? 'Редактировать группу' : 'Новая группа'}</DialogTitle></DialogHeader>
          {groupDialog && (
            <div className="space-y-3">
              <Input placeholder="Название *" value={groupDialog.name || ''} onChange={e => setGroupDialog({ ...groupDialog, name: e.target.value })} />
              <Select value={groupDialog.type || 'single'} onValueChange={v => setGroupDialog({ ...groupDialog, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUP_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" placeholder="Мин. выбор" value={groupDialog.min_select ?? ''} onChange={e => setGroupDialog({ ...groupDialog, min_select: parseInt(e.target.value) || 0 })} />
                <Input type="number" placeholder="Макс. выбор" value={groupDialog.max_select ?? ''} onChange={e => setGroupDialog({ ...groupDialog, max_select: parseInt(e.target.value) || 1 })} />
              </div>
              <Input type="number" placeholder="Порядок" value={groupDialog.sort_order ?? ''} onChange={e => setGroupDialog({ ...groupDialog, sort_order: parseInt(e.target.value) || 0 })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={groupDialog.is_required ?? false} onChange={e => setGroupDialog({ ...groupDialog, is_required: e.target.checked })} />
                Обязательный выбор
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={groupDialog.is_active !== false} onChange={e => setGroupDialog({ ...groupDialog, is_active: e.target.checked })} />
                Активна
              </label>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setGroupDialog(null)}>Отмена</Button>
                <Button className="flex-1 bg-[#FF3B30] hover:bg-[#e8352b]" disabled={saving} onClick={saveGroup}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Сохранить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Option dialog */}
      <Dialog open={!!optionDialog} onOpenChange={open => !open && setOptionDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{optionDialog?.data.id ? 'Редактировать опцию' : 'Новая опция'}</DialogTitle></DialogHeader>
          {optionDialog && (
            <div className="space-y-3">
              <Input placeholder="Название *" value={optionDialog.data.name || ''} onChange={e => setOptionDialog({ ...optionDialog, data: { ...optionDialog.data, name: e.target.value } })} />
              <Input type="number" placeholder="Доп. цена (₸)" value={optionDialog.data.price ?? ''} onChange={e => setOptionDialog({ ...optionDialog, data: { ...optionDialog.data, price: parseFloat(e.target.value) || 0 } })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={optionDialog.data.is_active !== false} onChange={e => setOptionDialog({ ...optionDialog, data: { ...optionDialog.data, is_active: e.target.checked } })} />
                Активна
              </label>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setOptionDialog(null)}>Отмена</Button>
                <Button className="flex-1 bg-[#FF3B30] hover:bg-[#e8352b]" disabled={saving} onClick={saveOption}>Сохранить</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link dialog */}
      <Dialog open={!!linkDialog} onOpenChange={open => !open && setLinkDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Привязать к блюду</DialogTitle></DialogHeader>
          {linkDialog && (
            <div className="space-y-3">
              <Select value={linkDialog.itemId} onValueChange={v => setLinkDialog({ ...linkDialog, itemId: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите блюдо" /></SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setLinkDialog(null)}>Отмена</Button>
                <Button className="flex-1 bg-[#FF3B30] hover:bg-[#e8352b]" disabled={saving} onClick={addLink}>Привязать</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
