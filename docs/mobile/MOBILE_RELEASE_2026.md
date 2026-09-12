# Android и iOS: подготовка выпуска

Приложение всего портала называется **Sortirovka24**, идентификатор обеих платформ — `kz.sortirovka24.app`. DAM ALEM 2.0 — раздел доставки еды внутри портала. Не меняйте идентификатор или ключ подписи при обновлениях.

## Как работает API

Интерфейс включён в приложение. Каталог, кабинет, заказы и бонусы загружаются с HTTPS-сервера. Без сети операции сервера недоступны; встроенный интерфейс не означает работу заказов без интернета.

В `app/frontend/.env.mobile` укажите публичный адрес:

```dotenv
VITE_API_BASE_URL=https://sortirovka24-production-8788.up.railway.app
```

`node scripts/build-store-web.mjs android` (или `ios`) проверяет адрес, собирает интерфейс и синхронизирует Capacitor. Этот скрипт не перезаписывает `.env.mobile` и принудительно отключает удалённый `server.url` для своей сборки. Обычный `cap sync` без него снова может включить live-режим из `.env.mobile`.

Различайте три вида настроек:

- Публичный адрес API входит в приложение. Пользователь входит в свой аккаунт, сервер проверяет его персональный токен.
- Секреты сервера (JWT, платежи, SMS, Telegram, Firebase service account, APNs) хранятся в переменных серверного окружения. Общий секретный API-ключ, вшитый в APK/IPA, не защищает API.
- Ключ Android и сертификаты Apple подписывают файлы приложения. Это не ключи доступа к заказам или базе.

Все переменные `VITE_*` публичны. Проверка сборки запрещает распространённые имена серверных секретов, но не может распознать секрет под произвольным названием.

При настройке `CORS_ALLOWED_ORIGINS` сервер должен допускать `https://localhost` (Android) и `capacitor://localhost` (iOS). В исходниках это сохранено даже при пользовательском списке разрешённых сайтов.

## Android

Требуются JDK 21, Android SDK 36, Build Tools 35.0.0. Проект использует AGP 8.13.0 и Gradle 8.13. Существующий upload-keystore находится в игнорируемом Git каталоге Android. Храните его резервную копию и пароли отдельно; не заменяйте ключ после первой загрузки в Play Console.

Из `app/frontend`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-release.ps1
```

Результат: `releases/Sortirovka24-release.apk` для установки на телефон и `releases/Sortirovka24-release.aab` для Google Play. Новая версия — 1.0.27 (27). Для следующей загрузки нужен неиспользованный больший versionCode; параметр `-VersionCode 28` меняет его при сборке. Версию 1.0.x меняйте согласованно в Android и iOS.

Облачный workflow `Android Release` требует существующие `PLAY_KEYSTORE_BASE64`, `PLAY_KEYSTORE_PASSWORD`, `PLAY_KEY_ALIAS`, `PLAY_KEY_PASSWORD` в GitHub Actions Secrets. Он не публикует приложение.

## iOS без собственного Mac

В GitHub Actions подготовлен workflow **iOS build (simulator or signed App Store IPA)** на macOS 26:

- `signed=false`: сборка для симулятора без Apple Developer. Это не IPA для установки на iPhone.
- `signed=true`: подписанный IPA для App Store после настройки Apple Developer.

Для подписанной сборки нужны GitHub Actions Secrets:

- `APPLE_TEAM_ID`;
- `IOS_DISTRIBUTION_P12_BASE64` — экспорт Apple Distribution certificate вместе с приватным ключом;
- `IOS_DISTRIBUTION_P12_PASSWORD`;
- `IOS_PROVISION_PROFILE_BASE64` — App Store distribution profile для `kz.sortirovka24.app` той же команды.

Публичный API при необходимости задаётся Repository Variable `MOBILE_API_BASE_URL`. Build number вводится при запуске workflow, начиная с 27; для повторной загрузки используйте новый номер.

Workflow только выдаёт артефакты. Автоматической отправки в App Store или TestFlight нет. Раньше сценарий ошибочно полагался на один App Store Connect API-ключ для создания подписанного архива; теперь явно требуется distribution identity. Доступ к API App Store Connect не заменяет приватный ключ подписи.

На собственном Mac с установленными сертификатами: `APPLE_TEAM_ID=... BUILD_NUMBER=27 bash scripts/build-ios.sh`. Требуются Xcode 26+ и CocoaPods.

## До отправки на проверку магазинов

Ни один успешный build не гарантирует прохождение модерации. Пока нет аккаунтов разработчика, финальная загрузка невозможна.

1. Зарегистрировать Google Play Console и Apple Developer, создать приложения с указанным идентификатором.
2. Реализовать доступное из кабинета удаление аккаунта и связанных данных; сейчас есть только обращения к администрации. Политика хранения обязательных записей заказов должна быть согласована до реализации удаления.
3. Настроить push отдельно. Сейчас серверный `services/push_notifications.py` использует устаревший FCM Legacy API; требуется FCM HTTP v1 для Android и согласованная доставка APNs/FCM для iOS. Не включать `VITE_ENABLE_NATIVE_PUSH=true`, пока это не настроено и не проверено. Добавленные iOS callbacks — лишь часть интеграции, не готовая доставка push.
4. Проверить опубликованные privacy/terms, оформить Data Safety и App Privacy по фактическим данным; сверить PrivacyInfo.xcprivacy и назначения данных. Не копировать заявления «данные не собираем».
5. Обновить магазинные скриншоты: старые материалы могут содержать прежний дизайн и название еды.
6. На физических Android/iPhone проверить вход, загрузку фото, геолокацию, PIN/Face ID, восстановление после сворачивания, отсутствие сети, корзину и создание/статусы тестового заказа. Провести внутреннее тестирование магазина перед публичным выпуском.

Официальные требования, проверенные при подготовке 12.09.2026:

- [Google Play: целевой API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) — API 36 для новых обычных приложений/обновлений.
- [Apple: SDK](https://developer.apple.com/news/upcoming-requirements/?id=04282026a) — Xcode 26 / iOS SDK 26 или новее.
- [Apple: удаление аккаунта](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- [Совместимость AGP 8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes).

Не размещайте сертификаты, пароли, .p8/.p12, keystore или содержимое Secrets в Git, переписке или скриншотах.
