# Публикация Sortirovka24 — единый чеклист

Мобильное приложение: **Capacitor 7** (React → WebView), ID **`kz.sortirovka24.app`**.

| Платформа | Подробная инструкция | Стоимость аккаунта |
|-----------|---------------------|-------------------|
| **Google Play** | [`app/frontend/play-store/PLAY_STORE.md`](../app/frontend/play-store/PLAY_STORE.md) | $25 единоразово |
| **App Store (iOS)** | [`app/frontend/app-store/APP_STORE.md`](../app/frontend/app-store/APP_STORE.md) | $99/год |

Сборка и push: [`app/frontend/MOBILE_APP.md`](../app/frontend/MOBILE_APP.md)

---

## Быстрый старт (что делать по порядку)

### 0. Проверка готовности (Windows)

```powershell
cd app\frontend
npm run pre:store-check
npm run prepare:store-screenshots
```

### 1. Бэкенд и юридические страницы

- [ ] Railway: `/health` → `database: ok`
- [ ] Открываются по HTTPS:
  - `https://sortirovka24-production-8788.up.railway.app/privacy.html`
  - `https://sortirovka24-production-8788.up.railway.app/terms.html`
- [ ] На Railway заданы `MOBIZON_API_KEY`, `CLOUDINARY_*`, `JWT_SECRET`

### 2. Контент для магазинов (уже в репозитории)

| Материал | Файл |
|----------|------|
| Тексты Google Play | `app/frontend/play-store/LISTING_RU.md` |
| Data safety (Play) | `app/frontend/play-store/DATA_SAFETY.md` |
| Тексты App Store | `app/frontend/app-store/LISTING_RU.md` |
| App Privacy (Apple) | `app/frontend/app-store/APP_PRIVACY.md` |
| Скриншоты (требования) | `play-store/SCREENSHOTS.md`, `app-store/SCREENSHOTS.md` |
| Иконка 512 | `app/frontend/public/icon-512.png` |
| Feature graphic (Play) | `app/frontend/play-store/feature-graphic.png` |

### 3. Google Play (Android)

1. Аккаунт: https://play.google.com/console ($25)
2. Keystore (один раз): `npm run setup:play-keystore`
3. Release AAB — **локально** `npm run build:android:release` **или CI** Actions → **Android Release**
4. Загрузить AAB → Internal testing → Production
5. Скриншоты: `npm run prepare:store-screenshots` (8 PNG в `play-store/screenshots/`)
6. Заполнить карточку, Data safety, рейтинг контента

**Важно:** сохраните `android/PLAY_SIGNING_SECRET.txt` и `.jks` — без них обновления невозможны.

### 4. App Store (iOS, без Mac)

1. Apple Developer Program: https://developer.apple.com ($99/год)
2. App Store Connect → New App → Bundle ID `kz.sortirovka24.app`
3. API key (.p8) → 4 секрета в GitHub Actions (см. `APP_STORE.md`)
4. GitHub → Actions → **iOS Release (App Store / TestFlight)** → Run
5. TestFlight → выбрать билд → заполнить карточку → Submit for Review

---

## Режим сборки для магазинов

| Режим | `.env.mobile` | Когда использовать |
|-------|---------------|-------------------|
| **Bundled** (рекомендуется для ревью) | `CAPACITOR_SERVER_URL` **закомментирован** | App Store review, офлайн-старт |
| **Live URL** | `CAPACITOR_SERVER_URL=https://...railway.app` | обновления UI без нового APK |

CI для iOS (`ios-release.yml`) собирает **bundled** — UI внутри IPA, API на Railway.

Для Play Store первого релиза можно bundled или live URL — оба работают, если бэкенд доступен.

---

## Версии

Текущая синхронизированная версия: **1.0.26** (build/code **26**).

Поднять версию перед новым релизом:

```powershell
cd app\frontend
npm run bump:mobile-version
```

---

## Push-уведомления (опционально для v1)

Без Firebase push **не обязателен** для первой публикации.

Если нужен push позже:

1. Firebase Console → проект → Android + iOS apps
2. `google-services.json` → `android/app/` (шаблон: `google-services.json.example`)
3. `GoogleService-Info.plist` → Xcode
4. `FCM_SERVER_KEY` на Railway
5. `.env.mobile`: `VITE_ENABLE_NATIVE_PUSH=true` → пересборка

---

## Что проверить на реальном устройстве перед отправкой

- [ ] Регистрация по SMS
- [ ] Главная, DAM ALEM, кабинет открываются
- [ ] Геолокация запрашивается с понятным текстом (такси/доставка)
- [ ] Нет белого экрана при первом запуске
- [ ] Выключенные модули в админке скрываются в приложении

---

## Контакты для консолей

| Поле | Значение |
|------|----------|
| Support email | `support@sortirovka24.kz` (замените на рабочий) |
| Privacy URL | `https://sortirovka24-production-8788.up.railway.app/privacy.html` |
| Website | `https://sortirovka24-production-8788.up.railway.app` |
| Package / Bundle ID | `kz.sortirovka24.app` |

---

## App Review — тестовый доступ (Apple)

В App Store Connect → **App Review Information** укажите:

```
Регистрация по номеру телефона (SMS, Mobizon).
Тестовый номер и код предоставим по запросу в Review Notes.
Геолокация и камера — только по действию пользователя (доставка, такси, фото к объявлениям).
```

Если есть демо-аккаунт с паролем — добавьте логин/пароль в Review Information.

---

## Полезные команды

```powershell
cd app\frontend
npm run pre:store-check              # чеклист перед публикацией
npm run prepare:store-screenshots    # 8 скринов → play-store/ и app-store/
npm run setup:play-keystore          # keystore для Play (один раз)
npm run export:play-keystore         # base64 → GitHub secret для CI
npm run build:android:release        # подписанный AAB локально
npm run bump:mobile-version          # +1 версия Android + iOS
```

CI (GitHub Actions):
- **Android Release (Google Play AAB)** — подписанный AAB
- **iOS Release (App Store / TestFlight)** — IPA в TestFlight
