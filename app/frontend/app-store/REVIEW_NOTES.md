# App Review — заметки для Apple

Скопируйте в App Store Connect → версия приложения → **App Review Information** → **Notes**.

## Notes (English — Apple prefers English for review team)

```
Sortirovka24 is a neighborhood super-app for residents of Sortirovka district, Karaganda, Kazakhstan.

Sign-in: phone number + SMS verification (Mobizon). No demo password — we can provide a test phone number and OTP on request via App Review message.

Features to test without SMS (browse as guest):
- Home screen, news, directory, transport schedules
- Food catalog (DAM ALEM) — ordering requires login

Permissions:
- Location: only when user orders taxi or delivery (address picker)
- Camera / Photo Library: only when user uploads avatar or listing photo

Account deletion: user can request via in-app Support section or email support@sortirovka24.kz

The app ships bundled web assets and calls our HTTPS API on Railway. No third-party login (Google/Facebook).
```

## Sign-in required?

- **Yes** — для заказов, кабинета, объявлений
- Если есть тестовый номер с фиксированным SMS-кодом — укажите в **Username/Password** полях Review Information

## Contact

- First name / Last name: ответственный за приложение
- Phone: рабочий номер
- Email: support@sortirovka24.kz
