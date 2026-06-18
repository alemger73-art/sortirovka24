# Sortirovka24 — готовый APK



## Скачать (актуальная версия)



**Файл:** `Sortirovka24-v1.0.22-debug.apk` или `Sortirovka24-latest-debug.apk`



Версия **1.0.22** — live-режим (UI с Railway) + код push (включить после Firebase).



## Установка



1. Удалите старую версию с телефона

2. Установите APK из этой папки

3. Нужен интернет при запуске



## Обновления без APK



Деплой на Railway → пользователь перезапускает приложение.



## Push



Админка → **Система → Push-уведомления**. Нужны Firebase + `FCM_SERVER_KEY` на Railway.



## Пересборка



```

cd app\frontend

npm run build:android

```



Чеклист тестов: `TESTING_CHECKLIST.md`


