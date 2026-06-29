# Sortirovka24 Админ — отдельное приложение

Полноценное **отдельное приложение** для управления всем проектом Sortirovka24.
Админ-панель встроена в APK — открывается как обычное приложение, без браузера.

## Что можно управлять

Всё то же, что и в веб-админке `/admin`:

| Раздел | Функции |
|--------|---------|
| Контент | Новости, баннеры, жалобы, справочник |
| Объявления | Объявления, недвижимость, вакансии, мастера, салоны |
| Еда | DAM ALEM (меню, заказы), парк, точки доставки |
| Сервисы | Инспекторы, такси, логистика, транспорт |
| Партнёры | Заявки партнёров, Гастроном, VOLNA, Прораб, Аптека |
| Система | Центр управления, модули, push (жители + admin APK), FrontPad |

## Установка на Android

1. Соберите APK (см. ниже) или возьмите готовый из `releases/`.
2. Перекиньте `Sortirovka24-Admin-latest-debug.apk` на телефон.
3. Откройте файл → разрешите установку из неизвестных источников.
4. Запустите **«Sortirovka24 Админ»** и войдите логином/паролем администратора.

`appId`: `kz.sortirovka24.admin` — ставится **рядом** с основным приложением `kz.sortirovka24.app`.

## Сборка APK (Windows)

**Требования:** Node.js, pnpm, Android Studio (Java).

```powershell
# 1. Зависимости основного приложения (один раз)
cd app/frontend
pnpm install

# 2. Собрать админ APK
cd ../admin-panel
npm install              # один раз
npm run build:android    # -> releases/Sortirovka24-Admin-latest-debug.apk
```

Первая сборка Gradle может занять 10+ минут.

## Разработка (браузер)

```powershell
cd app/frontend
pnpm run dev:admin       # http://localhost:3100
```

## Обновление

После изменений в админке пересоберите APK:

```powershell
cd app/admin-panel
npm run build:android
```

Переустановите APK на телефон.

## Структура

```
app/admin-panel/          # Capacitor-обёртка → Android APK
  capacitor.config.ts     # appId: kz.sortirovka24.admin
  scripts/build-android.ps1
  releases/               # Готовые APK

app/frontend/
  admin.html              # Точка входа админ-приложения
  vite.admin.config.ts    # Сборка в dist-admin/
  src/admin-shell/        # Маршруты только для админки
```

Код всех 30+ экранов админки переиспользуется из `app/frontend/src/pages/Admin*.tsx`.

## Сравнение с admin-app

| | **admin-panel** (это) | **admin-app** |
|---|---|---|
| Тип | Встроенный UI в APK | WebView на живой сайт |
| Скорость запуска | Быстрый | Зависит от интернета |
| Обновления UI | Пересборка APK | Автоматически с деплоем |

Для ежедневной работы рекомендуется **admin-panel**.

## Push-алерты на admin APK

При новых заявках (мастера, жалобы, заказы и т.д.) admin APK получает FCM-уведомление с переходом в нужный раздел.

1. Тот же `FCM_SERVER_KEY` на Railway, что и для основного приложения.
2. `google-services.json` из Firebase → `app/admin-app/android/app/` (отдельный Firebase Android app с package `kz.sortirovka24.admin`).
3. В `.env.mobile`: `VITE_ENABLE_NATIVE_PUSH=true` (включено автоматически при `pnpm run build:admin`).
4. Пересобрать admin APK и войти в панель — устройство зарегистрируется как admin.

В веб-админке алерты приходят через toast + бейджи (без FCM).
