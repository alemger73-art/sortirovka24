# Sortirovka24 — сборка мобильного приложения

Пошаговая инструкция: как упаковать веб-проект в **APK (Android)** или **IPA (iOS)**,
настроить push-уведомления и опубликовать в магазинах.

---

## Быстрая сборка APK (один клик)

> Полный чеклист деплоя и env-переменных: [`PRODUCTION_CHECKLIST.md`](../../PRODUCTION_CHECKLIST.md) в корне репозитория.

**APK уже можно собрать автоматически** — скрипт сам скачает Android SDK, соберёт web и упакует APK:

```powershell
cd app\frontend
npm run build:android
```

Или дважды кликните: `app\frontend\scripts\BUILD-ANDROID.bat`

Готовый файл появится в `app\frontend\releases\Sortirovka24-latest-debug.apk`.

---

## Автообновление (без переустановки APK)

По умолчанию приложение использует **встроенную сборку** (bundled) — работает без интернета при открытии.

Для автообновления UI без переустановки APK включите **режим live URL** в `.env.mobile`:

```env
CAPACITOR_SERVER_URL=https://sortirovka24-production-8788.up.railway.app
```

**Один раз** пересоберите APK с этой настройкой (`BUILD-ANDROID.bat`). Дальше для обычных правок UI/API достаточно деплоя на Railway.

> ⚠️ Live URL требует интернет при каждом запуске. Для стабильности рекомендуется bundled-режим (строка `CAPACITOR_SERVER_URL` закомментирована).

| Тип изменения | Нужен новый APK? |
|---------------|------------------|
| Страницы, дизайн, тексты, API-логика на сервере | Нет |
| Новый Capacitor-плагин, push, иконка, splash | Да |
| Смена `CAPACITOR_SERVER_URL` или package name | Да |

**Минус:** без интернета приложение не откроется (показывается предупреждение). Для полностью офлайн-режима уберите `CAPACITOR_SERVER_URL` и используйте bundled-режим (тогда снова нужна переустановка при обновлениях).

---

## Что уже есть в проекте

| Компонент | Описание |
|-----------|----------|
| **Capacitor 7** | Обёртка React → нативное приложение |
| **Нижняя навигация** | 5 вкладок: Главная · DAM ALEM · Объявления · Мастера · Ещё |
| **Экран «Ещё»** | Транспорт, справочник, такси, новости, кабинет и др. |
| **PWA** | Установка из браузера на главный экран |
| **Push API** | Бэкенд готов; в APK push **отключён** (нет Firebase) — см. шаг 5 |
| **API / картинки** | Все запросы идут на Railway через `VITE_API_BASE_URL`; загрузка фото — `storage.ts` + Cloudinary |

---

## Шаг 0. Что установить на компьютер

### Для Android (Windows / macOS / Linux)

1. **Node.js 20+** — https://nodejs.org  
2. **Android Studio** — https://developer.android.com/studio  
   - При установке отметьте: Android SDK, Android SDK Platform, Android Virtual Device  
3. **Java JDK 17** (обычно идёт с Android Studio)

### Для iOS (только macOS)

1. **Xcode** из App Store  
2. **CocoaPods**: `sudo gem install cocoapods`

---

## Шаг 1. Подготовка фронтенда

Откройте терминал в каталоге проекта:

```powershell
cd C:\Users\User\Documents\GitHub\sortirovka24\app\frontend
```

Установите зависимости:

```powershell
npm install
```

Создайте файл окружения для мобильной сборки (если ещё нет):

```powershell
copy .env.mobile.example .env.mobile
```

В `.env.mobile` укажите **абсолютный URL бэкенда** (на устройстве нет прокси Vite):

```env
VITE_API_BASE_URL=https://sortirovka24-production-8788.up.railway.app
```

Проверьте, что сборка проходит:

```powershell
npm run build:mobile
```

---

## Шаг 2. Синхронизация с нативными проектами

```powershell
npm run cap:sync
```

Эта команда:
1. Собирает React в `dist/`
2. Копирует файлы в `android/` и `ios/`
3. Обновляет Capacitor-плагины

---

## Шаг 3. Сборка Android APK

### 3.1 Открыть проект в Android Studio

```powershell
npm run cap:android
```

Или вручную: **File → Open** → папка `app/frontend/android`.

Дождитесь окончания Gradle Sync (первый раз может занять 10–20 минут).

### 3.2 Запуск на эмуляторе или телефоне

1. **Tools → Device Manager** → Create Device (например Pixel 7)  
2. Нажмите зелёную кнопку **Run ▶**  
3. Или подключите телефон по USB с включённой **«Отладкой по USB»**

### 3.3 Сборка APK для установки / публикации

**Debug APK** (для тестов, без подписи магазина):

```
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

Файл появится в:
`android/app/build/outputs/apk/debug/app-debug.apk`

Скопируйте APK на телефон и установите (разрешите установку из неизвестных источников).

**Release APK / AAB** (для Google Play):

```powershell
cd app\frontend
# 1. Скопируйте android/keystore.properties.example → android/keystore.properties
# 2. Создайте keystore (см. комментарии в example-файле)
npm run build:android:release
```

Артефакты: `releases/Sortirovka24-release.aab` и `Sortirovka24-release.apk`

Или через Android Studio: **Build → Generate Signed Bundle / APK**

---

## Шаг 4. Сборка iOS (только Mac)

```bash
cd app/frontend
npm run cap:sync
npm run cap:ios
```

В Xcode:

1. Выберите Team (Apple Developer Account)  
2. **Signing & Capabilities** → добавьте **Push Notifications**  
3. Выберите симулятор или подключённый iPhone  
4. **Product → Run** (▶)

Для App Store: **Product → Archive** → Distribute App.

---

## Шаг 5. Push-уведомления (Firebase)

Без Firebase push на Android не заработает. iOS тоже использует Firebase как мост к APNs.

### 5.1 Создать проект Firebase

1. https://console.firebase.google.com → **Add project**  
2. Имя: `Sortirovka24`

### 5.2 Android

1. Firebase → **Add app** → Android  
2. Package name: `kz.sortirovka24.app` (должен совпадать с `applicationId` в `android/app/build.gradle`)  
3. Скачайте **`google-services.json`**  
4. Положите файл сюда:

```
app/frontend/android/app/google-services.json
```

5. Пересоберите:

```powershell
npm run cap:sync
```

### 5.3 iOS

1. Firebase → **Add app** → iOS  
2. Bundle ID: как в Xcode (обычно `kz.sortirovka24.app`)  
3. Скачайте **`GoogleService-Info.plist`** → добавьте в Xcode в папку App  
4. Загрузите APNs-ключ (.p8) в Firebase → Project Settings → Cloud Messaging  
5. В Xcode: **Signing & Capabilities** → **+ Capability** → Push Notifications

### 5.4 Ключ сервера на бэкенде

1. Firebase → **Project settings** → **Cloud Messaging**  
2. Скопируйте **Server key** (Legacy)  
3. Добавьте в Railway / `.env` бэкенда:

```env
FCM_SERVER_KEY=AAAA...ваш_ключ...
```

4. Перезапустите бэкенд. Таблица `push_devices` создаётся через Alembic-миграцию или при первом старте.

5. В `.env.mobile` включите `VITE_ENABLE_NATIVE_PUSH=true` и пересоберите APK.

### 5.5 Проверка push

1. Установите приложение на телефон  
2. Разрешите уведомления при первом запуске  
3. Токен сохранится через `POST /api/v1/push/register`  
4. **Автоматически:** push уходит при публикации новости (`published=true`)  
5. **Вручную (админ):** `POST /api/v1/push/broadcast` с JWT админки:

```json
{
  "title": "Sortirovka24",
  "body": "Тестовое уведомление",
  "path": "/"
}
```

6. Проверка конфигурации: `GET /api/v1/push/status` → `{ "enabled": true }`  
7. Тест через Firebase Console → **Messaging** → **Send test message** → FCM-токен из `push_devices`

Формат данных для перехода в приложении при нажатии на push:

```json
{
  "notification": { "title": "Новый заказ", "body": "DAM ALEM" },
  "data": { "path": "/food" }
}
```

---

## Шаг 6. Публикация в магазинах

### Google Play

1. Аккаунт разработчика — https://play.google.com/console ($25 единоразово)  
2. **Create app** → заполните описание, скриншоты, иконку 512×512  
3. Загрузите **AAB** (не APK) в **Production → Create new release**  
4. Пройдите модерацию (обычно 1–7 дней)

Нужно подготовить:
- Иконка 512×512 PNG  
- Скриншоты телефона (минимум 2)  
- Краткое и полное описание на русском  
- Политика конфиденциальности (страница `/legal/privacy` на сайте)

### App Store (Apple)

1. Apple Developer Program — https://developer.apple.com ($99/год)  
2. App Store Connect → **New App**  
3. Archive из Xcode → Upload  
4. Заполните метаданные, скриншоты, возрастной рейтинг  
5. Отправьте на Review

---

## Шаг 7. Обновление приложения после изменений в коде

Каждый раз после правок во фронтенде:

```powershell
cd app\frontend
npm run cap:sync
```

Затем в Android Studio / Xcode — **Run** или пересоберите release.

Увеличьте версию перед публикацией в магазин:

**Android** — `android/app/build.gradle`:
```gradle
versionCode 2        // целое, всегда больше предыдущего
versionName "1.1.0"
```

**iOS** — Xcode → General → Version / Build.

---

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| Белый экран в приложении | Проверьте `VITE_API_BASE_URL` в `.env.mobile`, пересоберите `npm run build:mobile` |
| API не отвечает | URL должен быть `https://...` без слэша в конце; бэкенд должен быть доступен из интернета |
| Gradle sync failed | Android Studio → File → Invalidate Caches; проверьте JDK 17 |
| Картинки не грузятся / загрузка фото не работает | Проверьте `VITE_API_BASE_URL` и `CLOUDINARY_*` на Railway; полностью переустановите APK |
| Push не приходят | В текущем APK push отключён (краш без Firebase). Нужны `google-services.json`, `@capacitor/push-notifications`, `FCM_SERVER_KEY` |
| `pnpm` не найден | Используйте `npm` — скрипты одинаковые |

---

## Краткая шпаргалка команд

```powershell
cd app\frontend
npm install
copy .env.mobile.example .env.mobile
npm run build:mobile      # только web-сборка
npm run cap:sync          # сборка + синхронизация
npm run cap:android       # открыть Android Studio
npm run cap:ios           # открыть Xcode (Mac)
```

---

## Структура файлов мобильной части

```
app/frontend/
├── capacitor.config.ts       # ID приложения, splash, status bar
├── .env.mobile               # URL API для устройства
├── android/                  # Android Studio проект
│   └── app/
│       ├── google-services.json   ← Firebase (не коммитить!)
│       └── build.gradle
├── ios/                      # Xcode проект
├── src/
│   ├── components/MobileBottomNav.tsx
│   ├── pages/More.tsx
│   └── lib/pushNotifications.ts
```

Бэкенд push:

```
app/backend/
├── models/push_devices.py
├── routers/push_notifications.py
└── services/push_notifications.py
```
