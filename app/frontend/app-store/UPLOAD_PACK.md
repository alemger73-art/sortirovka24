# App Store Connect — что куда вставить

## 1. Apple Developer + App

- Enroll: https://developer.apple.com/programs/ ($99/год)
- App Store Connect → **Apps** → **+** → **New App**
  - Platform: iOS
  - Name: **Сортировка 24**
  - Language: Russian
  - Bundle ID: **kz.sortirovka24.app**
  - SKU: `sortirovka24`

## 2. Сборка (без Mac)

GitHub → **Settings → Secrets → Actions**:

| Secret | Откуда |
|--------|--------|
| `APPLE_TEAM_ID` | developer.apple.com → Membership → Team ID |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect → Users and Access → Integrations → API Key |
| `APP_STORE_CONNECT_ISSUER_ID` | там же |
| `APP_STORE_CONNECT_API_KEY` | содержимое файла `AuthKey_XXXX.p8` целиком |

Actions → **iOS Release (App Store / TestFlight)** → **Run workflow**

Через 5–15 мин: App Store Connect → **TestFlight** → Processing → Ready.

## 3. App Information

| Поле | Значение |
|------|----------|
| Subtitle | из `LISTING_RU.md` |
| Privacy Policy URL | `https://sortirovka24-production-8788.up.railway.app/privacy.html` |
| Category Primary | Lifestyle |
| Category Secondary | Food & Drink |
| Content Rights | Does not contain third-party content (или по факту UGC) |

## 4. Version 1.0 — Prepare for Submission

| Поле | Значение |
|------|----------|
| Description | `LISTING_RU.md` |
| Keywords | `LISTING_RU.md` |
| Promotional Text | `LISTING_RU.md` |
| Support URL | `https://sortirovka24-production-8788.up.railway.app` |
| Marketing URL | опционально, тот же |
| Screenshots 6.7" | `app-store/screenshots/` (`npm run store:prep`) |
| Build | выбрать из TestFlight |
| What's New | `LISTING_RU.md` |

## 5. App Privacy

Заполнить по **`APP_PRIVACY.md`** — Tracking: **No**.

## 6. App Review Information

Скопировать из **`REVIEW_NOTES.md`**.

| Поле | Значение |
|------|----------|
| Contact email | support@sortirovka24.kz |
| Notes | English text from REVIEW_NOTES.md |

## 7. Submit

- Export Compliance: **No** (standard encryption only — уже в Info.plist)
- **Add for Review** → **Submit**

Ревью: обычно 24–48 часов.
