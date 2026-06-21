# Firebase Push — настройка Android

1. Создайте проект в [Firebase Console](https://console.firebase.google.com/)
2. Добавьте Android-приложение с package name: `kz.sortirovka24.app`
3. Скачайте `google-services.json` → положите в:
   ```
   app/frontend/android/app/google-services.json
   ```
4. Railway → `FCM_SERVER_KEY` (Legacy server key из Firebase Cloud Messaging)
5. `.env.mobile`:
   ```
   VITE_ENABLE_NATIVE_PUSH=true
   ```
6. Пересборка APK: `npm run build:android:release`

Без `google-services.json` push регистрация на устройстве не заработает — приложение продолжит работать без push.
