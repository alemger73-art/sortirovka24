# Google Play Console — что куда вставить

Откройте [Play Console](https://play.google.com/console) → ваше приложение.

## Создание приложения

| Поле | Значение |
|------|----------|
| App name | Sortirovka24 |
| Default language | Русский |
| App or game | App |
| Free or paid | Free |

## Main store listing

| Поле | Файл / значение |
|------|-----------------|
| App name | `Сортировка 24` |
| Short description | из `LISTING_RU.md` |
| Full description | из `LISTING_RU.md` |
| App icon | `public/icon-512.png` |
| Feature graphic | `play-store/feature-graphic.png` |
| Phone screenshots | `play-store/screenshots/*.png` (или `npm run store:prep`) |

## App content

| Раздел | Значение |
|--------|----------|
| Privacy policy | `https://sortirovka24-production-8788.up.railway.app/privacy.html` |
| Data safety | ответы в `DATA_SAFETY.md` |
| Content rating | IARC анкета → обычно Everyone / 12+ |
| Target audience | Не для детей до 13 |
| News apps | No |
| COVID | No |
| Data collection | Yes (см. DATA_SAFETY) |

## Release

1. **Testing → Internal testing → Create release**
2. Upload: `releases/Sortirovka24-release.aab`
   - Собрать: двойной клик **`BUILD_PLAY_RELEASE.bat`**
3. Release notes: из `LISTING_RU.md` (What's New)
4. Review → Start rollout to Internal testing
5. Проверить на телефоне → **Production → Promote**

## Контакты

| Поле | Значение |
|------|----------|
| Email | support@sortirovka24.kz |
| Website | https://sortirovka24-production-8788.up.railway.app |

## Категория

- Primary: **Lifestyle**
- Secondary: **Food & Drink**
