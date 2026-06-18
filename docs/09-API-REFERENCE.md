# API Reference — Sortirovka24

Справочник REST API бэкенда FastAPI. Базовый URL:

- **Локально:** `http://127.0.0.1:8000`
- **Прод (пример):** `https://sortirovka24-production-8788.up.railway.app`

Интерактивная документация (если включена): `/docs` (Swagger), `/redoc`.

---

## Общие правила

### Формат
- JSON request/response
- Кодировка UTF-8
- Даты — ISO-строки (как в моделях)

### Заголовки

| Header | Когда |
|--------|-------|
| `Authorization: Bearer <token>` | Защищённые endpoints (житель или admin) |
| `Content-Type: application/json` | POST/PUT с телом |
| `App-Host` | Admin login (origin клиента) |

### Два типа JWT

| Token | Получение | Использование |
|-------|-----------|---------------|
| **Account JWT** | `/api/v1/account/login`, register, Google | Жители, кабинеты, заказы |
| **Admin JWT** | `/api/v1/admin-auth/login` | Админ-панель, CRUD, modules, push |

### SDK envelope

Некоторые ответы оборачиваются middleware `sdk_compat` в `{ "data": ... }`. Frontend (`lib/api.ts`) разворачивает envelope автоматически.

### Module guard

Если модуль выключен в Admin → Modules, его API возвращает **404** (кроме запросов с admin panel JWT).

---

## Health и система

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/health` | — | Статус сервера и БД |
| GET | `/api/v1/weather` | — | Погода для виджета (Караганда/Сортировка) |
| GET | `/api/v1/modules` | — | `{ "food": true, "news": false, ... }` |
| GET | `/api/v1/modules/admin/settings` | Admin | Сырые настройки модулей |
| PUT | `/api/v1/modules/admin/settings` | Admin | Включить/выключить модули |

---

## Аутентификация жителей — `/api/v1/account`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/register/request-sms` | — | Запрос SMS-кода |
| POST | `/register/confirm` | — | Подтверждение → JWT + аккаунт |
| POST | `/register` | — | Регистрация (legacy/alternate) |
| POST | `/login` | — | Вход по телефону/паролю → JWT |
| GET | `/google/status` | — | Доступен ли Google OAuth |
| GET | `/google/start` | — | Redirect на Google |
| GET | `/google/callback` | — | Callback OAuth → JWT |
| POST | `/logout` | Account | Выход |
| GET | `/me` | Account | Профиль |
| PUT | `/me` | Account | Обновить профиль |
| POST | `/me/change-password` | Account | Смена пароля |
| POST | `/me/set-password` | Account | Установить пароль |
| POST | `/me/avatar-upload-url` | Account | URL загрузки аватара |
| GET/POST/PUT/DELETE | `/me/addresses/*` | Account | Адреса доставки |
| POST | `/me/addresses/geocode` | Account | Геокодирование |
| GET | `/cabinet` | Account | Данные личного кабинета |
| GET | `/master/cabinet` | master | Кабинет мастера |
| PUT | `/master/profile` | master | Профиль мастера |
| GET/POST | `/masters/{id}/reviews/*` | Account | Отзывы |
| PUT | `/master/requests/{id}/status` | master | Статус заявки |
| GET | `/partner/cabinet` | seller | Кабинет партнёра |
| GET | `/admin/dashboard` | admin roles | Статистика кабинета админа |
| GET/PUT/DELETE | `/admin/users/*` | admin | Управление пользователями |
| GET | `/admin/registrations` | admin | Регистрации |
| GET | `/admin/bonuses` | admin | Бонусы |
| GET | `/admin/orders` | admin | Заказы |
| GET | `/admin/complaints` | admin | Жалобы |
| GET | `/admin/announcements` | admin | Объявления |
| GET | `/admin/logs` | admin | Audit log |
| GET | `/admin/settings` | admin | Feature toggles |

---

## Админ-панель — `/api/v1/admin-auth`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/login` | — | Логин → admin JWT |
| POST | `/verify-session` | Admin | Проверка токена |
| POST | `/logout` | Admin | Выход |
| GET | `/login-log` | Admin | История входов |
| POST | `/create-admin` | Secret | Создание admin (prod) |
| POST | `/change-credentials` | Admin | Смена логина/пароля |

---

## Storage — `/api/v1/storage`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/upload-url` | Account/Admin | Presigned upload URL |
| POST | `/download-url` | Account/Admin | Presigned download |
| POST | `/public/upload-url` | — | Публичная загрузка (ограничено) |
| POST | `/public/download-url` | — | Публичный доступ к изображениям |
| PUT | `/upload-proxy/{token}` | — | Proxy upload в Cloudinary |
| POST | `/create-bucket` | Admin | Bucket management |
| GET | `/list-buckets` | Admin | Список buckets |
| GET | `/list-objects` | Admin | Объекты |
| DELETE | `/delete-object` | Admin | Удаление |

---

## Контент (entities CRUD)

Стандартный паттерн для сущностей:

```
GET    /api/v1/entities/{name}           — список (публичный фильтр)
GET    /api/v1/entities/{name}/all       — все записи (admin)
GET    /api/v1/entities/{name}/{id}      — одна запись
POST   /api/v1/entities/{name}           — создать
PUT    /api/v1/entities/{name}/{id}      — обновить
DELETE /api/v1/entities/{name}/{id}      — удалить
POST   /api/v1/entities/{name}/batch     — batch create
PUT    /api/v1/entities/{name}/batch     — batch update
DELETE /api/v1/entities/{name}/batch     — batch delete
```

### Сущности

| Entity path | Module | Описание |
|-------------|--------|----------|
| `/entities/news` | news | Новости |
| `/entities/announcements` | announcements | Объявления |
| `/entities/complaints` | complaints | Жалобы ЖКХ |
| `/entities/jobs` | jobs | Вакансии |
| `/entities/questions` | questions | Вопросы |
| `/entities/question_answers` | questions | Ответы |
| `/entities/directory_entries` | directory | Справочник |
| `/entities/masters` | masters | Мастера |
| `/entities/master_requests` | masters | Заявки к мастерам |
| `/entities/become_master_requests` | masters | Заявки «стать мастером» |
| `/entities/salons` | salons | Салоны |
| `/entities/inspectors` | inspectors | Участковые |
| `/entities/real_estate` | real_estate | Недвижимость |
| `/entities/history_events` | history | История района |
| `/entities/banners` | — | Баннеры главной |
| `/entities/categories` | — | Категории контента |
| `/entities/bus_routes` | transport | Маршруты |
| `/entities/bus_stops` | transport | Остановки |
| `/entities/bus_notifications` | transport | Уведомления |
| `/entities/food_items` | food | Позиции меню |
| `/entities/food_orders` | food | Заказы еды |
| `/entities/food_restaurants` | food | Рестораны |
| `/entities/food_categories` | food | Категории меню |
| `/entities/food_modifiers` | food | Модификаторы |
| `/entities/food_settings` | food | Настройки еды |
| `/entities/park_points` | food | Точки парка |
| `/entities/park_orders` | food | Заказы парка |
| `/entities/couriers` | food | Курьеры |
| `/entities/frontpad_settings` | food | Настройки FrontPad |
| `/entities/frontpad_sync_log` | food | Лог синхронизации |
| `/entities/homepage_stats` | — | Статистика главной |

---

## Еда DAM ALEM — `/api/v1/food`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/delivery-quote` | — | Расчёт доставки |
| POST | `/validate-promo` | — | Проверка промокода |
| POST | `/admin/seed-catalog` | Admin | Seed каталога |
| GET | `/admin/catalog-verify` | Admin | Проверка каталога |

Каталог и заказы также через `/entities/food_*` и `delivery_catalog`.

---

## FrontPad — `/api/v1/frontpad`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/settings` | Admin | Настройки интеграции |
| POST | `/test-connection` | Admin | Проверка API |
| POST | `/debug-api` | Admin | Debug ответ FrontPad |
| POST | `/sync` | Admin | Синхронизация меню |
| POST | `/send-order` | Admin/System | Отправка заказа в кассу |
| GET | `/sync-log` | Admin | Лог синхронизации |

---

## Гастроном — `/api/v1/gastronom`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/catalog` | — | Каталог |
| POST | `/delivery-quote` | — | Стоимость доставки |
| GET/POST/PUT/DELETE | `/categories/*` | Admin | Категории |
| GET/POST/PUT/DELETE | `/products/*` | Admin | Товары |
| GET/POST | `/orders` | Account | Заказы |
| PUT | `/orders/{id}/status` | Admin | Статус заказа |
| GET/PUT | `/settings` | Admin | Настройки магазина |

Аналогичная структура у **Прораб** (`/api/v1/prorab`) и **Аптека** (`/api/v1/pharmacy`).

---

## Такси — `/api/v1/taxi`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/settings` | — | Настройки такси |
| POST | `/quote` | — | Расчёт стоимости |
| POST | `/geocode` | — | Геокодирование |
| POST | `/suggest` | — | Подсказки адресов |
| GET | `/route` | — | Маршрут |
| POST | `/rides` | Account | Создать поездку |
| GET | `/rides/my` | Account | Мои поездки |
| GET | `/rides/active` | Account | Активная поездка |
| GET | `/rides/{id}` | Account | Детали |
| POST | `/rides/{id}/cancel` | Account | Отмена |
| POST | `/rides/{id}/rate` | Account | Оценка |
| GET | `/driver/cabinet` | driver | Кабинет водителя |
| PUT | `/driver/online` | driver | Online/offline |
| PUT | `/driver/location` | driver | GPS |
| PUT | `/driver/profile` | driver | Профиль авто |
| GET | `/driver/available` | driver | Доступные заказы |
| POST | `/driver/rides/{id}/accept` | driver | Принять |
| POST | `/driver/rides/{id}/decline` | driver | Отклонить |
| POST | `/driver/rides/{id}/status` | driver | Статус поездки |
| GET/POST | `/driver/application` | Account | Заявка стать водителем |
| GET/PUT | `/admin/*` | Admin | Админ такси |

---

## Логистика / курьеры — `/api/v1/logistics`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/courier/access` | Account | Есть ли доступ курьера |
| GET/POST | `/courier/application` | Account | Заявка курьера |
| GET | `/courier/cabinet` | Courier | Кабинет |
| PUT | `/courier/online` | Courier | Online |
| PUT | `/courier/location` | Courier | GPS |
| PUT | `/courier/profile` | Courier | Профиль |
| POST | `/tasks/{id}/accept` | Courier | Принять задачу |
| POST | `/tasks/{id}/decline` | Courier | Отклонить |
| POST | `/tasks/{id}/status` | Courier | Обновить статус |
| GET | `/tasks/{id}` | Courier | Детали задачи |
| GET | `/track/food/{order_id}` | — | Трекинг доставки |
| GET/POST | `/admin/*` | Admin | Управление курьерами |

---

## Push — `/api/v1/push`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/register` | Account | FCM token устройства |
| POST | `/unregister` | Account | Отписка |
| POST | `/broadcast` | Admin | Рассылка всем |
| GET | `/status` | Admin | Статус FCM |
| GET | `/stats` | Admin | Статистика |

---

## Telegram — `/api/v1/telegram`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | `/webhook` | Telegram secret | Callback inline-кнопок |
| * | другие | Admin/System | Отправка уведомлений (internal) |

---

## Support — `/api/v1/support`

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/settings` | — | Настройки страницы поддержки |
| PUT | `/settings` | Admin | Обновить реквизиты/тексты |

---

## Прочее

| Prefix | Описание |
|--------|----------|
| `/api/v1/auth` | Legacy OIDC auth |
| `/api/v1/users` | Legacy users |
| `/api/v1/accounts` | Account system v1 |
| `/api/v1/aihub` | AI модуль (OpenAI) |
| `/api/v1/admin/settings` | Admin settings |
| `/api` | `delivery_catalog` — каталог доставки |
| `/api/v1/debug` | Debug schema (dev only) |

---

## Коды ответов

| Code | Значение |
|------|----------|
| 200 | OK |
| 201 | Created |
| 400 | Bad request / validation |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found / module disabled |
| 429 | Rate limit (SMS) |
| 500 | Server error |
| 503 | Service unavailable (cold start) |

---

## Примеры

### Health check
```bash
curl https://YOUR-API/health
```

### Публичные модули
```bash
curl https://YOUR-API/api/v1/modules
```

### Login жителя
```bash
curl -X POST https://YOUR-API/api/v1/account/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+77001234567","password":"secret"}'
```

### Запрос с JWT
```bash
curl https://YOUR-API/api/v1/account/me \
  -H "Authorization: Bearer YOUR_JWT"
```

---

## Связанные документы

- [Роли и безопасность](./05-РОЛИ-И-БЕЗОПАСНОСТЬ.md)
- [Модули](./04-МОДУЛИ.md)
- [Разработка](./06-РАЗРАБОТКА.md)

*При добавлении нового router обновляйте этот файл.*
