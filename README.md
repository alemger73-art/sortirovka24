# Sortirovka24

«Супер-приложение» жилого района Сортировка (Караганда): доставка еды, объявления,
новости, мастера, транспорт, справочник и админ-панель.

- **Фронтенд:** React 18 + TypeScript + Vite, Tailwind, shadcn/ui
- **Бэкенд:** FastAPI + SQLAlchemy (async), PostgreSQL (или SQLite для разработки)
- **Языки интерфейса:** русский / казахский

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

## Деплой

- **Бэкенд:** Railway (`app/frontend/vercel.json` проксирует `/api/*` на Railway) либо
  AWS Lambda (`app/backend/lambda_handler.py`).
- **Фронтенд:** Vercel / статический хостинг (`dist/`).
