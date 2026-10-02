# Production release — 2 октября 2026

**Опубликовано и проверено:** source commit `8e529c603150f0c4c3c1c3b516edf1d08538f069`, Railway deployment `2ccabc06-f2c2-41ee-89d2-29ef37688675`, status SUCCESS. `/health` возвращает этот build ID, healthy, database=ok. Код отправлен в `codex/real-estate-workflow` GitHub; production опубликован из чистого архива этого commit. Изменение Docker ARG в архиве задаёт тот же build ID, без секретов и локальных файлов.

## Что опубликовано

PWA install assistant Android/iOS, ранний захват beforeinstallprompt, standalone detection, безопасные maskable icons, offline document, управляемое обновление SW, разрешения/предпочтения Web Push, owner/admin diagnostics, аналитические события, безопасные notification deep links и сохранение ссылки на заказ через вход. Также опубликован накопленный этап меню/комбо/добавок, CRM/loyalty, оплаты/предзаказов/самовывоза и outbox.

- [Полный PWA-аудит, архитектура, ENV, инструкция Samsung/iPhone и ограничения](pwa-report-2026-10-02.md).
- [Инструкция всех кабинетов и схема заказов/бонусов](dam-crm-workflow-guide-2026-09-28.md).
- [Управление меню, добавками и комбо](dam-menu-report-2026-09-28.md).
- [Все файлы выпуска относительно предыдущего production](pwa-release-changed-files-2026-10-02.txt).

## Защита данных и миграции

Перед изменением создан PostgreSQL custom-format backup, 410328 bytes, SHA256 `8201c7fa0df42ca501da6414673e69ad4622a957679d5454add5915acb606a6f`. Копия находится в игнорируемой `.cache/pwa-release-production-20261002`, не отправлена в GitHub или образ.

Историческая база не имела Alembic revision: перед baseline сверены 311 ранее проверенных колонок. Первая попытка upgrade через внешнее соединение встретила deadlock с запросом работающего сайта и полностью откатилась. Повторный upgrade внутри Railway завершился до запуска HTTP-сервера. Новый head: `dam20261006_pwa_preferences`.

Контроль до/после: food_orders 32/32, food_items 202/202, food_order_events 152/152, food_shifts 8/8, bonuses 21/21, users 6/6. Production не восстанавливался из дампа, записи не удалялись. Неоднозначные legacy customer/bonus связи не назначались произвольно бизнесу; требуется OWNER-review. [Подтверждение базы и backup](pwa-evidence-2026-10-02/production-migration.json).

## Проверки после публикации

Manifest 200 `application/manifest+json`; SW/push SW/offline document 200 и no-store; v3 icons 200 image/png. Кеш Cloudflare первоначально содержал старые 404 новых иконок; после revalidation обе обычные ссылки дают 200. http/non-www и прежний публичный Railway origin перенаправляются на HTTPS www, сохраняя маршрут.

Owner: diagnostics/menu management/loyalty/business overview/catalog/orders 200. Operator: diagnostics/menu management/loyalty/business overview 403, operational catalog/orders 200. Чужой business API 403 для обеих ролей. Публичный menu catalog и backend line quote работают. Проверка использовала подписанные сессии существующих сотрудников внутри контейнера; она проверяет RBAC/API, не является проверкой их паролей. Новые production пользователи/заказы для тестов не создавались.

Свежий обычный профиль Chrome на публичном production: manifest errors=[], installabilityErrors=[], SW активен с release-specific URL. Offline и восстановление сети прошли. [Публичные HTTP-проверки](pwa-evidence-2026-10-02/production.json), [Chrome production proof](pwa-evidence-2026-10-02/production-browser.json).

Локальные проверки текущего PWA: backend **24 passed**, frontend **15 passed**, browser **7 passed**; TypeScript, lint, production build успешны. Существующее предупреждение о размере JS chunk остаётся. Полный suite накопленного этапа до PWA: 559 passed / 2 skipped — исторический результат, а не повтор полного suite после PWA.

Временный Railway SSH key от выпуска удалён, локальные private/public copies удалены. Секреты не включены в commit, отчёты или образ.

## Открыть

- Клиент: https://www.sortirovka24.kz/cabinet
- Меню: https://www.sortirovka24.kz/food
- Владелец: https://www.sortirovka24.kz/partner/dam-alem
- Оператор: https://www.sortirovka24.kz/partner/dam-alem/operator
- Курьер: https://www.sortirovka24.kz/food/courier
- Диагностика, после входа владельцем/admin: https://www.sortirovka24.kz/admin/pwa-diagnostics

## Что ещё требует проверки

Физические Samsung/iPhone: системная установка, иконка, standalone после reboot, сохранение входа, permission, реальная доставка foreground/background/closed push и переход к заказу. UA emulation не проверяет настоящий WebKit/Samsung Internet. Web Push server config уже enabled, но это не доказательство доставки на телефон. Подробные шаги находятся в PWA-отчёте.

Live Kaspi/Halyk/WhatsApp не подключены этим выпуском; нужны реальные credentials/contracts и интеграционные проверки. SMS отдельно требует проверки действующего провайдера. APK не пересобирался: локально встроенный frontend APK не получает новый UI от веб-деплоя. Старый browser shortcut сам не превращается в установленную PWA; удалите старую ссылку и выполните системную установку заново.

**Итог: production release SUCCESS; аппаратная PWA/push test matrix остаётся открытой.**
