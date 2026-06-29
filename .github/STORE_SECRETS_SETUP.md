# GitHub Secrets — мобильные релизы

## iOS → TestFlight / App Store

Workflow: **iOS Release (App Store / TestFlight)**

| Secret | Описание |
|--------|----------|
| `APPLE_TEAM_ID` | 10 символов, Team ID |
| `APP_STORE_CONNECT_KEY_ID` | Key ID API-ключа |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
| `APP_STORE_CONNECT_API_KEY` | Весь текст `.p8` файла |
| `IOS_API_BASE_URL` | *(опционально)* URL Railway |

## Android → signed AAB

Workflow: **Android Release (Google Play AAB)**

На своём ПК после `npm run setup:play-keystore`:

```powershell
cd app\frontend
npm run export:play-keystore
```

| Secret | Описание |
|--------|----------|
| `PLAY_KEYSTORE_BASE64` | содержимое `android/PLAY_KEYSTORE_BASE64.txt` |
| `PLAY_KEYSTORE_PASSWORD` | из `PLAY_SIGNING_SECRET.txt` |
| `PLAY_KEY_ALIAS` | `sortirovka24` |
| `PLAY_KEY_PASSWORD` | обычно = store password |
| `ANDROID_API_BASE_URL` | *(опционально)* URL Railway |

После добавления секретов: Actions → **Android Release** → Run → скачать AAB из Artifacts.
