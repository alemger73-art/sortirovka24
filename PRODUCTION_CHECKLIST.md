# Sortirovka24 — чеклист перед запуском для пользователей

## Railway (бэкенд) — обязательные переменные

| Переменная | Зачем |
|------------|--------|
| `DATABASE_URL` | PostgreSQL (Railway plugin) |
| `JWT_SECRET_KEY` | Сессии и JWT (случайная строка 32+ символов) |
| `ADMIN_PASSWORD` | Вход в `/admin` |
| `CLOUDINARY_CLOUD_NAME` | Загрузка фото |
| `CLOUDINARY_API_KEY` | Загрузка фото |
| `CLOUDINARY_API_SECRET` | Загрузка фото |
| `MOBIZON_API_KEY` | SMS-коды регистрации |
| `SMS_PROVIDER=mobizon` | Включить Mobizon |

Опционально: `FCM_SERVER_KEY` + Firebase — для push (сейчас в APK отключены).

## Проверка после деплоя

```bash
curl https://sortirovka24-production-8788.up.railway.app/health
# Ожидается: "status":"healthy", "database":"ok"
```

## Android APK для тестеров

1. Собрать: `cd app/frontend && npm run build:android`
2. Файл: `app/frontend/releases/Sortirovka24-latest-debug.apk`
3. **Полностью удалить** старую версию перед установкой

## Google Play (релиз)

1. Создать keystore → `android/keystore.properties` (см. `keystore.properties.example`)
2. `powershell -File scripts/build-android-release.ps1`
3. Загрузить `releases/Sortirovka24-release.aab` в Play Console

## Push-уведомления (когда понадобятся)

1. Firebase → `google-services.json` в `android/app/`
2. Вернуть `@capacitor/push-notifications` в проект
3. `FCM_SERVER_KEY` на Railway
4. `VITE_ENABLE_NATIVE_PUSH=true` в `.env.mobile` → пересборка APK

## Типичные проблемы

| Симптом | Решение |
|---------|---------|
| Пустые объявления/новости | Проверить `VITE_API_BASE_URL` в `.env.mobile`, пересобрать APK |
| Фото не грузятся | `CLOUDINARY_*` на Railway + APK v1.0.8+ |
| SMS не приходит | `MOBIZON_API_KEY`, баланс Mobizon |
| Выкидывает из аккаунта | Обновить APK (фикс сетевых ошибок) |
| Белый экран на странице | Обновить APK (ErrorBoundary + фиксы импортов) |
