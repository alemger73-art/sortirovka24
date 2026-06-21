# Sortirovka24 — чеклист перед запуском

## 1. Railway — обязательные переменные

| Переменная | Зачем |
|------------|--------|
| `DATABASE_URL` | PostgreSQL |
| `JWT_SECRET_KEY` | 32+ символов |
| `ADMIN_PASSWORD` | Не дефолтный |
| `ENVIRONMENT=production` | /docs off, no mock seed |
| `CLOUDINARY_*` | Фото |
| `MOBIZON_API_KEY` + `SMS_PROVIDER=mobizon` | SMS |
| `MGX_IGNORE_INIT_DATA=true` | Защита от demo-данных |

## 2. Рекомендуется для 10k пользователей

| Переменная | Зачем |
|------------|--------|
| `REDIS_URL` | Rate limit между репликами |
| `SENTRY_DSN` | Ошибки backend |
| `VITE_SENTRY_DSN` | Ошибки frontend (в `.env.mobile`) |
| `TELEGRAM_BOT_TOKEN_BUSINESS` | Заявки партнёров |
| `OPENWEATHERMAP_API_KEY` | Погода |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook заказов |

## 3. После деплоя

```powershell
Invoke-RestMethod https://sortirovka24-production-8788.up.railway.app/health
cd app\backend
$env:INTEGRITY_BASE_URL="https://sortirovka24-production-8788.up.railway.app"
pytest tests/test_integrity.py -v
```

## 4. APK

```powershell
cd app\frontend
npm run build:android:release
```

`.env.mobile`:
```
VITE_API_BASE_URL=https://sortirovka24-production-8788.up.railway.app
VITE_SUPPORT_WHATSAPP=77470304096
# VITE_SENTRY_DSN=...
# VITE_ENABLE_NATIVE_PUSH=true  # после Firebase
```

## 5. Бэкап БД

```powershell
$env:DATABASE_URL = "<railway-postgres-url>"
powershell -ExecutionPolicy Bypass -File scripts/backup-postgres.ps1
```

Или включите scheduled backup в Railway PostgreSQL plugin.

## 6. Push (Firebase)

См. `app/frontend/android/FIREBASE_SETUP.md`

## 7. Smoke-test

- [ ] SMS регистрация
- [ ] DAM ALEM заказ
- [ ] Business форма → Telegram
- [ ] Админ модерация
- [ ] Модули on/off

## 8. Безопасность (в коде)

- AI Hub — admin only
- Legacy register — 410
- FrontPad/couriers — admin read
- Park courier — PIN API
- Public upload — rate limit
- /docs — off in production

## 9. Типичные проблемы

| Симптом | Решение |
|---------|---------|
| Пустые страницы | Новый APK + VITE_API_BASE_URL |
| SMS не приходит | Mobizon баланс |
| Business заявка | TELEGRAM_BOT_TOKEN_BUSINESS |
| Rate limit 429 | REDIS_URL или подождать |
