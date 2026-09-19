# Безопасная разработка, staging и релизы Sortirovka24

## Контуры

| Контур | Git-ветка | Railway environment/service | База | Внешние действия |
|---|---|---|---|---|
| Production | `main` | существующий production | существующий production PostgreSQL | реальные |
| Staging | `develop` | отдельный staging service | отдельный staging PostgreSQL | выключены по умолчанию |
| Preview | pull request | опционально, после стабильного staging | временная или общая staging БД только для read-only проверок | выключены |

Production и staging нельзя связывать с одной PostgreSQL-службой. Репозиторий не содержит и не должен содержать значения секретов.

## Один раз настроить в Railway

1. Создать environment `staging` из пустого окружения, не копируя production variables автоматически.
2. Создать в нём отдельный PostgreSQL service.
3. Создать отдельный application service из этого GitHub-репозитория.
4. Указать branch `develop`, Root Directory оставить пустым, builder — корневой `Dockerfile`.
5. Добавить переменные по [`.env.staging.example`](../app/backend/.env.staging.example). Значения `JWT_SECRET_KEY`, `FOOD_SECRETS_KEY`, паролей и OAuth должны быть отдельными от production.
6. Сгенерировать Railway domain и записать его в `STAGING_BASE_URL`, `PUBLIC_FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`.
7. В GitHub добавить repository variable `STAGING_BASE_URL` с тем же URL.
8. Не подключать production PostgreSQL, volume или custom domain к staging.

Приложение staging не запустится, если хост `DATABASE_URL` отличается от `STAGING_DATABASE_HOST`, URL указывает на production или включены реальные FrontPad, WhatsApp, SMS/FCM. Telegram разрешается только отдельным флагом и только с тестовым ботом и тестовым чатом. Cloudinary, Google OAuth, Redis и Sentry по умолчанию отсутствуют; их можно включить только явным флагом с отдельным staging-ресурсом. Для Cloudinary дополнительно проверяется имя отдельного cloud/account.

`EXTERNAL_SIDE_EFFECTS=disabled` проверяется не только при запуске. Общий запрет стоит перед Telegram (включая токен из БД DÄM ALEM), WhatsApp, SMS, FCM push, FrontPad и Stripe, поэтому случайно сохранённый ключ не запускает реальную отправку.

## Ежедневная работа

1. Создать ветку задачи от `develop`: `codex/<короткое-название>`.
2. Внести изменения и запустить тесты локально.
3. Открыть pull request в `develop`.
4. После зелёного CI слить в `develop`.
5. Railway автоматически собирает staging; workflow `Staging smoke test` ждёт `/health/ready` и проверяет frontend, API, environment и базу.
6. Проверить сценарии вручную на staging.
7. Открыть pull request `develop` → `main`.
8. Сливать в `main` только после проверки staging и backup, если есть миграция.

Рекомендуемая branch protection для `main`: pull request обязателен, прямой push запрещён, required checks — backend, frontend, E2E, deploy safety. Для `develop` также требуются CI checks.

## Миграции

Перед staging/production deploy запускается статическая проверка `python scripts/check-migration-graph.py`. Сейчас она намеренно блокирует релиз: историческая Alembic-цепочка содержит дубликаты и отсутствующие parent revision. До отдельного аудита фактической таблицы `alembic_version` production исправлять старые revision ID или запускать миграции нельзя.

Безопасный порядок после ремонта цепочки:

1. Сделать backup staging.
2. Применить миграцию к staging и выполнить smoke/regression tests.
3. Проверить, что старая версия приложения совместима с новой схемой.
4. Перед production сделать `pg_dump` и записать текущий deployment ID.
5. Применять только backward-compatible expand migration; удаление/переименование колонок выполнять отдельным поздним релизом.
6. При ошибке откатывать код Railway deployment history или `git revert`; базу восстанавливать из backup либо выпускать проверенный forward-fix.

Нельзя продолжать запуск приложения после ошибки миграции. Текущий production start command делает именно это; менять его следует только после восстановления migration graph и проверки на staging.

## Проверки staging

Автоматическая публичная проверка:

```powershell
python scripts/smoke-staging.py --base-url https://STAGING_HOST
```

Она проверяет `/health/ready`, environment marker, отдельный database target, production health, SPA и Modules API. После создания staging дополнительно вручную проверить:

- регистрацию тестового пользователя и вход/выход;
- кабинет, адреса, бонусы и заявку курьера;
- корзину DÄM ALEM, доставку, самовывоз и checkout;
- заказ в кабинетах клиента, оператора и курьера;
- изменение статусов и стоп-лист;
- мобильный и desktop layout;
- отключение модулей;
- отсутствие staging-пользователя и заказа в production;
- отсутствие SMS, push, WhatsApp, Telegram и FrontPad событий в реальных каналах.

Для этих проверок использовать только вымышленные имя, телефон, адрес и заказ.

## Быстрый rollback production

1. В Railway открыть production service → Deployments → Redeploy последнего стабильного deployment.
2. Если релиз уже в `main`, создать `git revert <bad_commit>` и дождаться deploy.
3. Проверить `/health/ready`, главную страницу, авторизацию и один read-only API.
4. Если релиз менял схему, не откатывать код до проверки совместимости. Использовать подготовленный forward-fix или восстановление backup.

Локальный upload deploy через `scripts/deploy-railway.ps1` считается аварийным инструментом: он принимает только чистое дерево, `develop` для staging и требует явный `-AllowProduction` на `main`.
