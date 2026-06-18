import { Plus, Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type FoodPromoCode, newPromoCode } from '@/lib/foodPromo';

interface Props {
  codes: FoodPromoCode[];
  onChange: (codes: FoodPromoCode[]) => void;
}

export default function FoodPromoCodesEditor({ codes, onChange }: Props) {
  function update(idx: number, patch: Partial<FoodPromoCode>) {
    onChange(codes.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Tag className="h-4 w-4" /> Промокоды
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...codes, newPromoCode()])}>
          <Plus className="h-4 w-4 mr-1" /> Добавить
        </Button>
      </div>
      {codes.length === 0 ? (
        <p className="text-xs text-gray-500">Нет промокодов. Клиент вводит код при оформлении заказа.</p>
      ) : (
        codes.map((code, idx) => (
          <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-2 bg-gray-50/50">
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={code.code}
                onChange={(e) => update(idx, { code: e.target.value.toUpperCase() })}
                placeholder="Код (DAMALEM10)"
                className="h-9 font-mono uppercase"
              />
              <select
                value={code.type}
                onChange={(e) => update(idx, { type: e.target.value as FoodPromoCode['type'] })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="percent">Процент %</option>
                <option value="fixed">Фикс. сумма ₸</option>
                <option value="free_delivery">Бесплатная доставка</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {code.type !== 'free_delivery' && (
                <Input
                  type="number"
                  value={code.value || ''}
                  onChange={(e) => update(idx, { value: Number(e.target.value) || 0 })}
                  placeholder={code.type === 'percent' ? '10' : '500'}
                  className="h-9"
                />
              )}
              <Input
                type="number"
                value={code.min_order ?? ''}
                onChange={(e) => update(idx, { min_order: Number(e.target.value) || 0 })}
                placeholder="Мин. заказ ₸"
                className="h-9"
              />
            </div>
            <Input
              value={code.label || ''}
              onChange={(e) => update(idx, { label: e.target.value })}
              placeholder="Подпись для клиента (необяз.)"
              className="h-9"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={code.active !== false}
                  onChange={(e) => update(idx, { active: e.target.checked })}
                />
                Активен
              </label>
              <Button type="button" size="sm" variant="ghost" className="text-red-600 h-8" onClick={() => onChange(codes.filter((_, i) => i !== idx))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
