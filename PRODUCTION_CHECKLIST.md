# Sortirovka24 — чеклист перед запуском для пользователей



## Railway (бэкенд) — обязательные переменные



| Переменная | Зачем |

|------------|--------|

| `DATABASE_URL` | PostgreSQL (Railway plugin) |

| `JWT_SECRET_KEY` | Сессии и JWT (случайная строка 32+ символов) |

| `ADMIN_PASSWORD` | Вход в `/admin` (не оставлять дефолтный!) |

| `ENVIRONMENT=production` | Отключает /docs, mock-seed, debug SMS |

| `CLOUDINARY_CLOUD_NAME` | Загрузка фото |

| `CLOUDINARY_API_KEY` | Загрузка фото |

| `CLOUDINARY_API_SECRET` | Загрузка фото |

| `MOBIZON_API_KEY` | SMS-коды регистрации |

| `SMS_PROVIDER=mobizon` | Включить Mobizon |



Рекомендуется:

- `MGX_IGNORE_INIT_DATA=true` — дополнительная защита от demo-данных

- `TELEGRAM_WEBHOOK_SECRET` — если включён Telegram webhook для заказов

- `OPENWEATHERMAP_API_KEY` — погода на главной



Опционально: `FCM_SERVER_KEY` + Firebase — для push (сейчас в APK отключены).



**Не включать в production:** `SMS_EXPOSE_CODE=true` (коды только при модерации Mobizon).



## Проверка после деплоя



```powershell

Invoke-RestMethod https://sortirovka24-production-8788.up.railway.app/health

# Ожидается: status=healthy, database=ok



# /docs должен быть недоступен (404) в production

```



```powershell

cd app\backend

$env:INTEGRITY_BASE_URL="https://sortirovka24-production-8788.up.railway.app"

pytest tests/test_integrity.py -v

```



## Android APK для тестеров



1. Собрать: `cd app/frontend && npm run build:android`

2. Файл: `app/frontend/releases/Sortirovka24-latest-debug.apk`

3. **Полностью удалить** старую версию перед установкой



## Google Play (релиз)



Полная инструкция: `app/frontend/play-store/PLAY_STORE.md`



1. Keystore: `powershell -File app/frontend/scripts/setup-play-keystore.ps1`

2. AAB: `cd app/frontend && npm run build:android:release`

3. Загрузить `releases/Sortirovka24-release.aab` в Play Console

4. Privacy URL: `https://sortirovka24-production-8788.up.railway.app/privacy.html` (после деплоя)

5. Пароли подписи: `android/PLAY_SIGNING_SECRET.txt` (сохранить вне git!)



## Push-уведомления



1. Firebase → `google-services.json` в `android/app/`

2. Railway → `FCM_SERVER_KEY`

3. `.env.mobile` → `VITE_ENABLE_NATIVE_PUSH=true` → пересборка APK

4. Админка → **Система → Push-уведомления** — ручная рассылка и статистика

5. Авто-push при публикации новости (`published=true`)



## Frontend (.env.mobile)



| Переменная | Значение |

|------------|----------|

| `VITE_API_BASE_URL` | URL Railway API |

| `VITE_SUPPORT_WHATSAPP` | `77470304096` (или ваш номер) |



## Безопасность (проверено в коде)



- AI Hub — только admin JWT

- Legacy `/api/v1/accounts/register` — отключён (410)

- FrontPad settings, couriers PIN — только admin read

- Park courier — PIN API вместо публичного update

- Public upload — rate limit 30/час на IP



## Типичные проблемы



| Симптом | Решение |

|---------|---------|

| Пустые объявления/новости | Проверить `VITE_API_BASE_URL` в `.env.mobile`, пересобрать APK |

| Фото не грузятся | `CLOUDINARY_*` на Railway + APK v1.0.8+ |

| SMS не приходит | `MOBIZON_API_KEY`, баланс Mobizon |

| SMS код не на экране | Нормально в prod — ждите SMS или модерацию Mobizon |

| Выкидывает из аккаунта | Обновить APK (фикс сетевых ошибок) |

| Белый экран на странице | Обновить APK (ErrorBoundary + фиксы импортов) |

| Курьер парка не обновляет статус | Обновить APK (новый PIN API) |

