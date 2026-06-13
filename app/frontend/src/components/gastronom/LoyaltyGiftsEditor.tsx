import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ImageUpload from '@/components/ImageUpload';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';
import { formatMoney, newLoyaltyGift } from '@/lib/gastronomLoyalty';

interface Props {
  gifts: LoyaltyGift[];
  onChange: (gifts: LoyaltyGift[]) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

export default function LoyaltyGiftsEditor({ gifts, onChange, enabled, onEnabledChange }: Props) {
  const sorted = [...gifts].sort((a, b) => a.min_amount - b.min_amount || a.sort_order - b.sort_order);

  function updateGift(id: string, patch: Partial<LoyaltyGift>) {
    onChange(gifts.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function removeGift(id: string) {
    onChange(gifts.filter((g) => g.id !== id));
  }

  function addGift() {
    onChange([...gifts, newLoyaltyGift(gifts.length)]);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">Подарки за сумму заказа</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Клиент получает лучший подарок из достигнутых порогов. Сумма считается по товарам в корзине, без доставки.
            </p>
          </div>
          <label className="flex items-center gap-2 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onEnabledChange(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-gray-700">Включено</span>
          </label>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="text-sm text-gray-400 bg-gray-50 border border-dashed rounded-xl p-6 text-center">
          Порогов пока нет. Добавьте первый подарок — например, от 5 000 ₸.
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((gift, idx) => (
          <div key={gift.id} className="bg-white border rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-gray-300 shrink-0 hidden sm:block" />
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Уровень {idx + 1}
              </span>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gift.is_active}
                  onChange={(e) => updateGift(gift.id, { is_active: e.target.checked })}
                  className="rounded border-gray-300 text-emerald-600"
                />
                Активен
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 text-red-600 shrink-0"
                onClick={() => removeGift(gift.id)}
                aria-label="Удалить подарок"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">От суммы, ₸</label>
                <Input
                  type="number"
                  min={1}
                  step={100}
                  value={gift.min_amount || ''}
                  onChange={(e) => updateGift(gift.id, { min_amount: Number(e.target.value) || 0 })}
                  placeholder="5000"
                  className="h-10"
                />
                {gift.min_amount > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">от {formatMoney(gift.min_amount)}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Название подарка</label>
                <Input
                  value={gift.title}
                  onChange={(e) => updateGift(gift.id, { title: e.target.value })}
                  placeholder="Ручка, чупа-чупс..."
                  className="h-10"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Описание для клиента</label>
              <Textarea
                value={gift.description || ''}
                onChange={(e) => updateGift(gift.id, { description: e.target.value })}
                placeholder="Коротко: что именно получит клиент"
                rows={2}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Фото подарка (необязательно)</label>
              <ImageUpload
                value={gift.image_url || ''}
                onChange={(url) => updateGift(gift.id, { image_url: url })}
              />
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addGift} className="w-full h-11">
        <Plus className="h-4 w-4 mr-2" /> Добавить порог
      </Button>

      {sorted.length > 1 && (
        <p className="text-xs text-gray-400 leading-relaxed">
          Если заказ на 12 000 ₸, а есть пороги 5 000 и 10 000 — клиент получит подарок от 10 000 ₸ (лучший из достигнутых).
        </p>
      )}
    </div>
  );
}
