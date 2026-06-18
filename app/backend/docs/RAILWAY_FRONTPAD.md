# Railway — переменные для FrontPad (DAM ALEM)

После деплоя добавьте в **Railway → сервис backend → Variables**:

| Переменная | Значение |
|------------|----------|
| `FRONTPAD_SECRET` | Секретный код из FrontPad → Настройки → API |
| `FRONTPAD_AUTO_PUSH_ORDERS` | `true` |
| `FRONTPAD_SYNC_ON_START` | `true` (один раз подтянет меню, если каталог пуст) |

Опционально (если в FrontPad отдельные ключи):

- `FRONTPAD_MENU_SECRET` — только загрузка меню
- `FRONTPAD_ORDER_SECRET` — только отправка заказов
- `FRONTPAD_AFFILIATE_ID` — филиал для new_order
- `FRONTPAD_DELIVERY_PRODUCT_ID` — артикул товара «Доставка» в кассе

После сохранения переменных Railway перезапустит сервис.

## Проверка

1. `/admin?tab=pos-integration` → **Проверить подключение**
2. **Синхронизировать меню**
3. Оформите тестовый заказ на `/food` — в админке заказа появится бейдж **FP #…**

Ключ **никогда** не добавляйте во фронтенд или в git.
