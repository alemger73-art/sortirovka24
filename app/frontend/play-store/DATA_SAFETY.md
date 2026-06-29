# Data safety — ответы для Google Play Console

Используйте при заполнении **App content → Data safety**.

## Собираете ли данные?
**Да**

## Типы данных

| Тип | Собирается | Передаётся | Обязательно | Цель |
|-----|------------|------------|-------------|------|
| Имя | Да | Нет* | Да (регистрация) | Account management |
| Номер телефона | Да | Да (SMS-провайдер) | Да | Account management, SMS verification |
| Email | Опционально | Нет | Нет | Account management |
| Фото | Да (аватар, объявления) | Да (Cloudinary) | Нет | App functionality |
| Точная геолокация | Да | Да (сервер) | Нет | App functionality (такси, доставка) |
| История покупок / заказов | Да | Нет | Нет | App functionality |
| Device ID / diagnostics | Минимально (логи сервера) | Нет | Нет | Analytics, fraud prevention |

\* Передача третьим лицам только перечисленным процессорам (хостинг, SMS, CDN).

## Шифрование
- **Данные в пути:** HTTPS
- **Данные в покое:** на стороне сервера (PostgreSQL, Cloudinary)

## Удаление данных
Пользователь может запросить удаление аккаунта через поддержку в приложении.

## Дети
Приложение **не предназначено для детей до 13 лет**.

## Разрешения Android (из манифеста)
- `INTERNET` — работа с API
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` — такси и доставка (по запросу пользователя)
- `POST_NOTIFICATIONS` — push-уведомления (Android 13+, только после настройки Firebase)

## Политика конфиденциальности
```
https://sortirovka24-production-8788.up.railway.app/privacy.html
```
