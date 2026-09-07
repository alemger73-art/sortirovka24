import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';

export default function AdminDamAlemGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF3B30]/10 text-[#FF3B30]">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold text-gray-900">Как работает интернет-магазин {DAM_ALEM_BRAND}</p>
            <p className="text-xs text-gray-500">Витрина, корзина, зоны доставки и система учёта</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 text-sm text-gray-700 space-y-4">
          <div>
            <p className="font-semibold text-gray-900 mb-2">Клиент заказывает так:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>Открывает <strong>{DAM_ALEM_BRAND}</strong> на главной или в «Ещё»</li>
              <li>Добавляет блюда в корзину, при необходимости выбирает опции</li>
              <li>Оформляет: адрес, зона доставки, оплата</li>
              <li>Видит «Заказ принят №…» — статус в личном кабинете</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-2">Ваша админка:</p>
            <ul className="space-y-1 text-gray-600">
              <li><strong>Заведение</strong> — название и фото на витрине</li>
              <li><strong>Блюда / Категории / Опции</strong> — каталог без программиста</li>
              <li><strong>Заказы</strong> — статусы и выручка</li>
              <li><strong>Баннеры</strong> — акции на витрине</li>
              <li><strong>Настройки</strong> — зоны доставки, мин. заказ, часы работы</li>
              <li><strong>Учёт / API</strong> — ключи FrontPad для кассы</li>
            </ul>
          </div>

          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold mb-1">Модуль можно выключить</p>
            <p>Админ → Система → Модули → «Алем Фуд». Витрина, плитка на главной и API магазина пропадут у жителей.</p>
          </div>

          <Link
            to="/food"
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#FF3B30] hover:underline"
          >
            Открыть витрину как клиент <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
