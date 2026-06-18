# Sortirovka24

«Супер-приложение» жилого района Сортировка (Караганда): доставка еды, объявления,
новости, мастера, транспорт, справочник и админ-панель.

- **Фронтенд:** React 18 + TypeScript + Vite, Tailwind, shadcn/ui
- **Бэкенд:** FastAPI + SQLAlchemy (async), PostgreSQL (или SQLite для разработки)
- **Языки интерфейса:** русский / казахский

## Документация проекта

Полный комплект документов — в каталоге **[docs/](./docs/README.md)**:

| Документ | Описание |
|----------|----------|
| [Конституция](./docs/01-КОНСТИТУЦИЯ.md) | Принципы, ценности, границы проекта |
| [Цели и видение](./docs/02-ЦЕЛИ-И-ВИДЕНИЕ.md) | Миссия, аудитория, KPI, roadmap |
| [Архитектура](./docs/03-АРХИТЕКТУРА.md) | Стек, слои, деплой, интеграции |
| [Модули](./docs/04-МОДУЛИ.md) | Все функциональные блоки приложения |
| [Безопасность](./docs/05-РОЛИ-И-БЕЗОПАСНОСТЬ.md) | Роли, JWT, секреты |
| [Разработка](./docs/06-РАЗРАБОТКА.md) | Локальный запуск, соглашения |
| [Деплой](./docs/07-ДЕПЛОЙ-И-ЭКСПЛУАТАЦИЯ.md) | Прод, мониторинг, инциденты |
| [Глоссарий](./docs/08-ГЛОССАРИЙ.md) | Термины и аббревиатуры |

## Структура

```
app/
  frontend/   # React SPA (порт 3000)
  backend/    # FastAPI API (порт 8000)
```

## Быстрый старт (локальная разработка)

### 1. Бэкенд

```bash
cd app/backend
python -m venv .venv
.venv\Scripts\activate           # Windows
# source .venv/bin/activate      # macOS/Linux
pip install -r requirements.txt

# настройка окружения
copy .env.example .env           # Windows (или cp на macOS/Linux)
# по умолчанию используется локальная база SQLite — менять ничего не нужно

python main.py
```

Бэкенд поднимется на `http://127.0.0.1:8000`. Проверка: `http://127.0.0.1:8000/health`.
При первом запуске автоматически создаются таблицы, засеиваются демо-данные
из `mock_data/` и создаётся учётная запись администратора.

### 2. Фронтенд

```bash
cd app/frontend
pnpm install        # или: npm install
pnpm run dev        # или: npm run dev
```

Откроется на `http://localhost:3000`, запросы к `/api` проксируются на бэкенд (`:8000`).

## Сборка фронтенда

```bash
cd app/frontend
pnpm run build      # результат в app/frontend/dist/
```

## Переменные окружения

См. `app/backend/.env.example`. Минимально для запуска нужен только `DATABASE_URL`
(по умолчанию — SQLite). Cloudinary/Telegram/Stripe/OpenAI — опционально, для
соответствующих функций (загрузка фото, уведомления, оплата, AI).

## Мобильное приложение (Android / iOS)

**Подробная пошаговая инструкция:** [MOBILE_APP.md](app/frontend/MOBILE_APP.md)

Кратко:

### PWA (установка из браузера)

После `pnpm run build` сайт можно добавить на главный экран — сработает баннер
«Установить Sortirovka24» или пункт меню браузера.

### Сборка APK / IPA

**Требования:** Node.js, pnpm, Android Studio (для Android) или Xcode на macOS (для iOS).

```bash
cd app/frontend
pnpm install

# настройка API для нативной сборки (абсолютный URL бэкенда)
copy .env.mobile.example .env.mobile   # Windows
# cp .env.mobile.example .env.mobile   # macOS/Linux

# собрать web-бандл и синхронизировать с нативными проектами
pnpm run cap:sync

# открыть Android Studio / Xcode
pnpm run cap:android    # Windows / macOS / Linux
pnpm run cap:ios        # только macOS
```

Скрипты:
- `pnpm run build:mobile` — production-сборка с `.env.mobile`
- `pnpm run cap:sync` — build + `cap sync`
- `pnpm run cap:android` / `cap:ios` — sync + открытие IDE

Нативные проекты: `app/frontend/android/`, `app/frontend/ios/`.
ID приложения: `kz.sortirovka24.app`.

## Деплой

- **Бэкенд:** Railway (`app/frontend/vercel.json` проксирует `/api/*` на Railway) либо
  AWS Lambda (`app/backend/lambda_handler.py`).
- **Фронтенд:** Vercel / статический хостинг (`dist/`).
