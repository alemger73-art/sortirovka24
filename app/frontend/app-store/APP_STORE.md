# App Store — Sortirovka24 (iPhone)

Полная инструкция по публикации iOS-приложения в App Store. Техническая часть
(иконки, splash, privacy, версии, CI-сборка) уже подготовлена в репозитории.

> **Главное:** собрать и отправить iOS-приложение можно **без своего Mac** —
> через готовый GitHub Actions workflow на облачном macOS-раннере
> (`.github/workflows/ios-release.yml`). Нужен только аккаунт Apple Developer ($99/год).

---

## Что уже сделано в проекте

| Готово | Где |
|--------|-----|
| Bundle ID | `kz.sortirovka24.app` |
| Иконка приложения 1024×1024 (без альфа-канала) | `ios/App/App/Assets.xcassets/AppIcon.appiconset` |
| Splash-экраны (light + dark) | `ios/App/App/Assets.xcassets/Splash.imageset` |
| Исходники брендинга | `assets/icon.svg`, `assets/splash.svg` (+ `npm run gen:assets`) |
| Privacy-строки (камера, фото, геолокация, микрофон) | `ios/App/App/Info.plist` |
| Export compliance (`ITSAppUsesNonExemptEncryption=false`) | `Info.plist` |
| Версия `1.0.26`, build `26` | `ios/App/App.xcodeproj` |
| Bundled-режим (работает без сети при ревью) | `ios/App/App/capacitor.config.json` |
| CI-сборка подписанного IPA + загрузка в TestFlight | `.github/workflows/ios-release.yml` |
| Локальная сборка на Mac | `scripts/build-ios.sh` (`npm run build:ios`) |
| Параметры экспорта | `ios/ExportOptions.plist` |
| Тексты карточки App Store | `app-store/LISTING_RU.md` |
| App Privacy (ярлыки конфиденциальности) | `app-store/APP_PRIVACY.md` |
| Требования к скриншотам | `app-store/SCREENSHOTS.md` |

---

## Шаг 1 — Apple Developer Program ($99/год)

1. https://developer.apple.com/programs/ → **Enroll**
2. Оплатите $99/год (физлицо или организация).
3. Дождитесь активации (обычно от часа до 2 дней).
4. Узнайте свой **Team ID**: https://developer.apple.com/account → **Membership details** → *Team ID* (10 символов).

---

## Шаг 2 — Создать приложение в App Store Connect

1. https://appstoreconnect.apple.com → **Apps** → **+** → **New App**.
2. Платформа: **iOS**.
3. Name: **Sortirovka 24** (из `LISTING_RU.md`).
4. Primary Language: **Russian**.
5. Bundle ID: выберите `kz.sortirovka24.app`
   (если его нет — создайте Identifier на https://developer.apple.com/account/resources/identifiers,
   тип App, без особых capabilities).
6. SKU: `sortirovka24` (любое уникальное значение).

---

## Шаг 3 — App Store Connect API key (для автоматической загрузки)

Этот ключ позволяет CI подписывать и загружать сборку **без сертификатов и Mac**.

1. App Store Connect → **Users and Access** → вкладка **Integrations** → **App Store Connect API**.
2. **Generate API Key** (роль: **App Manager** или **Admin**).
3. Запишите **Key ID** и **Issuer ID**.
4. Скачайте файл **`AuthKey_XXXXXXXXXX.p8`** — он скачивается **только один раз**, сохраните в надёжном месте.

---

## Шаг 4 — Добавить секреты в GitHub

Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Значение |
|--------|----------|
| `APPLE_TEAM_ID` | ваш Team ID (10 символов) |
| `APP_STORE_CONNECT_KEY_ID` | Key ID из шага 3 |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID из шага 3 |
| `APP_STORE_CONNECT_API_KEY` | **всё содержимое** файла `AuthKey_XXXX.p8` (вставьте целиком, с `-----BEGIN PRIVATE KEY-----`) |
| `IOS_API_BASE_URL` *(опционально)* | URL бэкенда (по умолчанию Railway production) |

---

## Шаг 5 — Запустить сборку (без Mac)

1. GitHub → вкладка **Actions** → workflow **iOS Release (App Store / TestFlight)**.
2. **Run workflow** → ветка `main` → **Run**.
3. Раннер macOS сам: соберёт web в bundled-режиме, синхронизирует Capacitor,
   поставит pods, заархивирует, подпишет через API key и загрузит в TestFlight.
4. Через 5–15 минут сборка появится в App Store Connect → **TestFlight**
   (статус «Processing» → затем доступна).

> Номер билда подставляется автоматически (`github.run_number`). При желании
> можно задать вручную в поле **build_number** при запуске workflow.

### Альтернатива — сборка на Mac

```bash
cd app/frontend
APPLE_TEAM_ID=XXXXXXXXXX npm run build:ios            # только IPA
# или с автозагрузкой в TestFlight:
UPLOAD=1 APPLE_TEAM_ID=XXXXXXXXXX ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=~/AuthKey_XXXX.p8 npm run build:ios
```

Либо открыть проект в Xcode: `npm run cap:ios` → **Product → Archive** → **Distribute App**.

---

## Шаг 6 — Заполнить карточку App Store

В App Store Connect → ваше приложение → версия **1.0**:

- **Name / Subtitle / Promotional text / Description / Keywords** — из `app-store/LISTING_RU.md`.
- **Screenshots** — обязательны для 6.7" (iPhone 15/16 Pro Max) и 6.5". См. `app-store/SCREENSHOTS.md`.
- **App Icon** — подтянется из сборки автоматически.
- **Support URL:** `https://sortirovka24-production-8788.up.railway.app`
- **Marketing URL** (опц.): тот же.
- **Privacy Policy URL:** `https://sortirovka24-production-8788.up.railway.app/privacy.html`

### App Privacy (обязательно)
Заполните по `app-store/APP_PRIVACY.md` (App Store Connect → **App Privacy**).

### Age Rating
Анкета без «взрослого» контента → обычно **4+** или **12+** (если есть пользовательский контент в объявлениях, выберите соответствующие пункты — выйдет 12+/17+).

---

## Шаг 7 — Отправить на ревью

1. В версии **1.0** в разделе **Build** выберите загруженную из TestFlight сборку.
2. **Export Compliance:** приложение использует только стандартный HTTPS →
   уже задано `ITSAppUsesNonExemptEncryption=false`, дополнительных вопросов не будет.
3. **Add for Review** → **Submit**.
4. Ревью Apple: обычно 24–48 часов.

---

## Обновление в будущем

1. Поднимите версию в `ios/App/App.xcodeproj` (`MARKETING_VERSION`, напр. `1.0.24`).
   Номер билда (`CURRENT_PROJECT_VERSION`) CI поднимает сам.
2. Actions → **iOS Release** → **Run workflow**.
3. App Store Connect → создайте новую версию → выберите свежий билд → Submit.

---

## Частые причины реджекта и как мы их закрыли

| Причина (Guideline) | Решение в проекте |
|---------------------|-------------------|
| 2.1 — приложение падает / белый экран | bundled-режим: UI зашит в приложение, работает офлайн при ревью |
| 2.3.10 — упоминание Android | в карточке App Store не упоминать Android/Google Play |
| 2.5.4 — фоновый режим push без реализации | убран `UIBackgroundModes: remote-notification` из Info.plist |
| 4.2 — «просто сайт» | нативная нижняя навигация, геолокация, камера, splash — полноценный клиент |
| 5.1.1 — нет описания доступа к данным | заданы все `NS*UsageDescription` в Info.plist |
| 5.1.1(v) — нет удаления аккаунта | удаление аккаунта через поддержку (указано в App Privacy / политике) |

---

## Чеклист перед отправкой

- [ ] Railway `/health` → `database: ok`, бэкенд доступен из интернета
- [ ] `privacy.html` и `terms.html` открываются по HTTPS
- [ ] Apple Developer Program активен, известен Team ID
- [ ] 4 секрета добавлены в GitHub Actions
- [ ] Workflow **iOS Release** прошёл, билд виден в TestFlight
- [ ] Скриншоты 6.7" загружены
- [ ] App Privacy заполнен
- [ ] Карточка (name/keywords/description) заполнена из `LISTING_RU.md`
