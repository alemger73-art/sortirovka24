# App Privacy — ответы для App Store Connect

Заполняется в App Store Connect → ваше приложение → **App Privacy**.
Apple спрашивает по каждому типу данных: собираете ли, для чего, связаны ли
с пользователем (linked), используются ли для трекинга (tracking).

> **Tracking:** **НЕТ.** Приложение не отслеживает пользователей между
> приложениями/сайтами и не использует рекламные идентификаторы → раздел
> **App Tracking Transparency не требуется**, во всех типах данных ставьте
> «Used for Tracking: No».

## Собираете ли данные?
**Да (Yes, we collect data).**

## Типы данных (Data Types)

| Тип данных | Категория ASC | Цель (Purpose) | Linked to user | Tracking |
|------------|---------------|----------------|----------------|----------|
| Имя | Contact Info → Name | App Functionality, Account Management | Да | Нет |
| Номер телефона | Contact Info → Phone Number | App Functionality, Account Management | Да | Нет |
| Email (опционально) | Contact Info → Email Address | App Functionality, Account Management | Да | Нет |
| Геолокация (точная) | Location → Precise Location | App Functionality (такси, доставка) | Да | Нет |
| Фотографии | User Content → Photos or Videos | App Functionality (объявления, аватар, заявки) | Да | Нет |
| История заказов | Purchases → Purchase History | App Functionality | Да | Нет |
| Контент поддержки | User Content → Customer Support | App Functionality | Да | Нет |
| Диагностика/логи | Diagnostics → Crash/Performance Data | App Functionality, fraud prevention | Нет | Нет |

> Платежи в приложении не принимаются (нет данных карт). Реклама отсутствует.

## Передача третьим лицам (Data shared)
Передаётся только обработчикам (data processors), не для рекламы:
- **Хостинг/БД** — Railway (PostgreSQL)
- **SMS-верификация** — Mobizon (номер телефона)
- **Хранилище изображений (CDN)** — Cloudinary (фото)

## Шифрование
- В пути: HTTPS/TLS.
- В покое: на стороне сервера (PostgreSQL, Cloudinary).
- Export compliance: только стандартное шифрование → `ITSAppUsesNonExemptEncryption=false`.

## Удаление аккаунта (требование Apple 5.1.1(v))
Пользователь может запросить удаление аккаунта и всех связанных данных через
**поддержку в приложении** (раздел «Поддержка»). Опишите это в политике
конфиденциальности на `/privacy.html`.

## Дети
Приложение **не предназначено для детей**. Не входит в категорию Kids.

## Privacy Policy URL
```
https://sortirovka24-production-8788.up.railway.app/privacy.html
```
