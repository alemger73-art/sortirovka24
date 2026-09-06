import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

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
            <p className="font-bold text-gray-900">Инструкция DAM ALEM 2.0</p>
            <p className="text-xs text-gray-500">Для вас и для клиентов — коротко и по делу</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 text-sm text-gray-700 space-y-4">
          <div>
            <p className="font-semibold text-gray-900 mb-2">Клиент заказывает так:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>Нажимает <strong>+</strong> у блюда (или карточку → опции → в корзину)</li>
              <li>Открывает <strong>корзину</strong> внизу экрана</li>
              <li><strong>Оформляет</strong>: имя, телефон, доставка/самовывоз, зона, оплата</li>
              <li>Видит «Заказ принят №…» — статус в <Link to="/cabinet" className="text-[#FF3B30] underline" target="_blank">кабинете</Link></li>
            </ol>
          </div>

          <div>
            <p className="font-semibold text-gray-900 mb-2">Ваша админка:</p>
            <ul className="space-y-1 text-gray-600">
              <li><strong>Заведение</strong> — описание видно на /food</li>
              <li><strong>Блюда / Категории / Опции</strong> — меню без программиста</li>
              <li><strong>Заказы</strong> — статусы, поиск, выручка за сегодня, автообновление</li>
              <li><strong>Баннеры</strong> — карусель на /food, файл <strong>1200×720 px</strong> (5:3)</li>
              <li><strong>Настройки</strong> — зоны доставки, мин. заказ, сервисный сбор %</li>
            </ul>
          </div>

          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold mb-1">Зоны доставки</p>
            <p>Настраиваются в «Настройки». Клиент выбирает зону при оформлении — цена доставки подставится автоматически. Названия зон должны быть понятными (например: «Центр Сортировки», «Мкр. Восточный»).</p>
          </div>

          <p className="text-xs text-gray-400">
            Полный документ: <code className="bg-gray-100 px-1 rounded">app/frontend/docs/DAM_ALEM_ИНСТРУКЦИЯ.md</code>
          </p>

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
