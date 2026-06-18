# Sortirovka24 Админ — отдельное приложение

Отдельное Android-приложение для управления всем проектом Sortirovka24.
Это **приложение-обёртка**: оно открывает живую админ-панель, размещённую на сервере
(Railway, страница `/admin`), внутри собственного окна-приложения.

## Как это работает

- Приложение в режиме **live-server**: WebView открывает
  `https://sortirovka24-production-8788.up.railway.app/admin`.
- Всё управление (новости, объявления, заказы еды, мастера, такси, push и т.д.)
  работает так же, как в браузере, — это та же самая админка.
- **Обновления приходят сами:** когда вы деплоите фронтенд на Railway,
  установленное приложение при следующем запуске показывает уже новую версию.
  Пересобирать и переустанавливать APK не нужно.
- Вход — обычный логин/пароль администратора (тот же, что и на сайте).

`appId`: `kz.sortirovka24.admin` — это отдельное приложение, оно не конфликтует
с основным `kz.sortirovka24.app` и ставится рядом с ним.

## Установка на телефон

1. Возьмите готовый APK из папки `releases/` (например `Sortirovka24-Admin-latest-debug.apk`).
2. Перекиньте файл на Android-телефон (через кабель, Telegram, почту и т.п.).
3. На телефоне откройте файл и разрешите «установку из неизвестных источников».
4. Запустите приложение «Sortirovka24 Админ» и войдите под админ-аккаунтом.

> Это debug-сборка — её удобно ставить вручную. Для публикации в Google Play
> нужна подписанная release-сборка (см. ниже).

## Сборка APK (на компьютере с Windows)

Требования: Node.js, Android Studio (даёт Java/JBR). Android SDK переиспользуется
из основного приложения (`app/frontend/.android-sdk`).

```powershell
cd app/admin-app
npm install              # один раз
npm run build:android    # собирает APK -> releases/
```

Готовый файл появится в `app/admin-app/releases/Sortirovka24-Admin-latest-debug.apk`.

Первая сборка скачивает Gradle и зависимости и может занять 10+ минут.
Последующие — намного быстрее.

## Изменить адрес сервера

Если бэкенд переедет на другой домен, поменяйте URL в двух местах и пересоберите:

- `capacitor.config.ts` — константы `BACKEND_HOST` / `ADMIN_URL`;
- `www/index.html` — переменная `ADMIN_URL` (экран при отсутствии связи).

```powershell
npm run build:android
```

## Release-сборка для Google Play (по желанию)

Можно переиспользовать keystore основного приложения
(`app/frontend/android/sortirovka24-release.jks`) или создать новый,
затем собирать `bundleRelease` / `assembleRelease` в `android/`.
Для отдельного приложения в Play нужен уникальный `applicationId`
(`kz.sortirovka24.admin` уже уникален).

## Структура

```
app/admin-app/
  capacitor.config.ts   # appId, имя, live-URL на /admin
  www/index.html        # экран загрузки / офлайн-заглушка
  android/              # нативный Android-проект (генерируется)
  scripts/
    build-admin-android.ps1
  releases/             # собранные APK
```
