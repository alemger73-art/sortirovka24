# Sortirovka24: PWA-аудит и исправления — 02.10.2026

## Аудит production

Стек: React/Vite, vite-plugin-pwa 0.21.2 / Workbox, FastAPI, SQLAlchemy, Alembic, PostgreSQL, pywebpush. Capacitor APK — отдельная сборка.

Canonical: **https://www.sortirovka24.kz**. HTTP/HTTPS без www и HTTP с www уже дают 301 на него. Manifest, SW, push-SW, Apple icon и PNG 192/512 возвращают 200; manifest/SW имеют no-store. Web Push public-key endpoint сообщил enabled=true. Приватные ключи не извлекались и не публикуются. Сырые результаты: [live audit](pwa-live-audit-2026-10-02.json).

Старый https://sortirovka24-production-8788.up.railway.app открывался как отдельный origin. Добавлен 301 его web GET/HEAD с сохранением пути/query. API/POST/health сохранены для инфраструктуры. Staging/localhost не перенаправляются.

## Причины установки

Причину конкретного Android-ярлыка без телефона доказать нельзя. Production manifest уже содержал standalone; сломанного HTTPS, scope и отсутствующих иконок не обнаружено. Ссылка может появляться при выборе соответствующего browser action, в приватном/встроенном браузере либо до готовности системной установки. Код сайта не может автоматически превратить старую ссылку в PWA.

Подтверждённые дефекты: listener beforeinstallprompt монтировался поздно; постоянные installed/dismissed localStorage-флаги навсегда отключали предложение, даже после удаления приложения; accepted считался фактом установки; ручного flow без prompt не было. Maskable-файлы совпадали с обычными иконками без отдельной safe zone.

iOS: одна инструкция для всех браузеров, iPad с desktop UA не распознавался, navigator.share() из страницы не гарантировал пункт Add to Home Screen. Не было помощника и пояснения Open as Web App. Официальные источники: [Chrome iOS](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=en), [Apple](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), [WebKit Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Manifest, icons, standalone

Итог: id=/, name=Sortirovka 24, short_name=S24, description=Вся Сортировка в одном месте, start_url=/?source=pwa, scope=/, display=standalone, orientation=any, lang=ru. Цвета сохранены: #F8FAFC / #2563EB. display_override убран. Стабильный id сохранён для существующих установок.

192/512 any — бренд v2; 192/512 maskable — отдельные v3 PNG. Исходный artwork помещён внутрь обязательного safe circle. Apple 180 сохранён. Генератор scripts/gen-pwa-maskable.mjs использует существующий логотип. Backend явно отдаёт application/manifest+json и отключает CDN-кеш manifest/SW.

Capture prompt происходит при старте, до React. Prompt вызывается только по клику и потребляется один раз. Accepted, dismissed и appinstalled — отдельные события. Запуск проверяется display-mode standalone/fullscreen и navigator.standalone, а не localStorage. Native APK/standalone не получают предложение. Dismiss истекает через 7 дней; ручная установка всегда доступна в «Ещё».

Safari: Browser Share → Add to Home Screen → Open as Web App, если есть → Add; отсутствующий пункт добавляется через Edit Actions. Chrome iOS: Share справа от адресной строки → Add to Home Screen; при отсутствии — Safari. Встроенные браузеры получают предложение открыть системный браузер. Samsung получает собственную инструкцию. Однокнопочная установка iOS не обещается. Старую обычную ссылку нужно удалить и установить приложение заново, без очистки всех данных/авторизации.

## SW, caching, SEO, updates

Сохранён Workbox generateSW + importScripts('/push-sw.js'). JS/CSS/fonts/public images precache. **HTML/API не кешируются.** Online navigation идёт к серверу за актуальным SEO HTML и настоящими статусами 404. Сетевой сбой даёт отдельный offline.html с повтором и автоматическим возвратом при online; offline checkout/цены/заказы не обещаются.

CacheStorage хранит public offline shell/лого и временную отметку времени push click без order/customer data. Токены, баланс, заказы, payment status туда не записываются.

Сохранён update flow: /sw.js?v=уникальный_BUILD_ID, updateViaCache=none, проверки при foreground/online и каждые 5 минут. Новая версия ждёт «Обновить», затем SKIP_WAITING/reload. Checkout не перезагружается неожиданно. Следующие релизы не должны использовать постоянный BUILD_ID=unknown. APK не получает новую встроенную оболочку этим способом — нужна отдельная APK-сборка.

## Web Push, subscriptions, events

Расширен существующий PushDevice, второй системы нет. Existing token JSON хранит endpoint/keys; id вычислен по endpoint; user_id, platform=web, active, created/updated сохранены; добавлены browser, device_platform, preferences, last_used_at. Несколько устройств аккаунта поддерживаются.

Кабинет → Настройки → Уведомления → собственная кнопка → permission по клику → active SW → PushManager.subscribe(VAPID) → авторизованный register-web. На iOS сначала Home Screen app. Проверка поддержки не запрашивает разрешение; denied повторно не спрашивается; ожидание SW ограничено 10 секундами. Отключение деактивирует серверную запись и вызывает unsubscribe. 404/410 provider деактивирует endpoint.

Существующие server-side order/logistics события и outbox сохранены: принятие, кухня, готовность, курьер, движение, завершение. Push только отражает состояние и не меняет заказ. URL заказа: /cabinet/orders/food/{id}. SW фокусирует/переводит существующее окно или открывает нужный URL. При истёкшей сессии после входа сохраняется нужный заказ. Уведомление — системное showNotification, текст не исполняется как HTML.

ORDER/food/store → orders, DELIVERY/logistics → delivery, NEWS → news, ADVERTISEMENT/marketing → marketing, SYSTEM — служебные события. Existing bonus/taxi/master сохранены. Новости/реклама по умолчанию OFF, в том числе для legacy устройств без preferences. Admin broadcast по умолчанию NEWS. Настройки действующих устройств аккаунта применяет защищённый PUT; локальные настройки сохранены для устройства и регистрации подписки.

## API, permissions, security

Existing endpoints: GET web-key; POST register-web/unregister-web, register/unregister; admin broadcast/stats. Added: PUT /api/v1/push/preferences, GET /api/v1/push/diagnostics-access, POST /api/v1/push/analytics.

Register/preferences берут user из действующей session, userId frontend не доверяют. Unregister другого аккаунта не меняет его endpoint. Broadcast admin-only + rate limit. Diagnostics OWNER/admin-only, обычный клиент/operator получает 403. Generic push_devices entity API закрыт даже при отключённой общей защите. Gateway allowlist + HTTPS + запрет credentials/custom ports/fragment защищают от произвольных server requests. Click URL проверяется на backend/SW/frontend: только внутренний путь, без //, обратного слеша, управляющих символов. Bearer-auth mutations не полагаются только на cookies.

VAPID private key только server ENV; не выводится в API/логи ошибок. Ротация ключей при каждом deploy запрещена: она ломает старые подписки. Native FCM legacy stack не модернизировался в рамках PWA-задачи; его готовность нельзя выводить из Web Push тестов.

## Diagnostics и analytics

После публикации: **/admin/pwa-diagnostics**, войдите в том же браузере как владелец DÄM ALEM или admin → Run PWA diagnostics. Platform/browser/HTTPS, manifest/start/scope/display, SW active/waiting/script/version, standalone/navigator.standalone, server Web Push enabled, permission/subscription exists, captured prompt. Endpoint/keys не выводятся. Отсутствие prompt не объявляется автоматически ошибкой.

Все запрошенные install/standalone/permission/subscription/click events добавлены. Allowlisted /analytics пишет структурированные server logs и событие s24:pwa-analytics. Нет customer ID, raw UA, query strings, GPS/fingerprinting. Это журнал событий, **не отдельная аналитическая панель/вечное хранилище метрик**; срок хранения задаёт logging infrastructure. Для iOS измеряется standalone_open, системного install event может не быть.

## Геолокация и UX

Existing requestCurrentPosition возвращает lat/lng/accuracy; ручной адрес остаётся доступен. В Гастрономе/Аптеке/Волне новый permission больше не запрашивается при открытии: восстанавливается только уже granted. GPS остаётся по кнопке. Client background tracking не добавлялся, native/courier tracking отдельно не переделывался.

Bottom navigation, router links, checkout, splash/brand сохранены. viewport-fit=cover / Apple meta / safe-area сохранены и уточнены; запрет zoom снят. Assistant адаптивен, имеет scroll/max-height и проверен при 390×844.

## Результаты проверок

- Backend PWA/origin/SEO/cabinet/outbox: **24 passed**, 0 failed/skipped; existing deprecation warnings.
- Frontend unit/runtime/update: **15 passed**, 0 failed.
- Browser production build: **7 passed**: manifest/installability; real SW offline/reconnect; no API/HTML cache; login deep link; diagnostics UI/version; Safari assistant; Chrome iOS assistant. Access API в UI mock, RBAC проверен backend tests.
- Chrome обычный isolated persistent profile: manifest errors=[], installabilityErrors=[]. Incognito ожидаемо сообщает in-incognito и не использовался как install proof.
- TypeScript/lint/production build: passed. Существующий warning большого JS chunk сохранён и не является installability error.
- Migration: SQLite с legacy subscription сохранила запись; восстановленный local PostgreSQL получил новый head без потери подписок; предыдущая репетиция полной накопленной цепочки сохранена.
- Full suite накопленного этапа **до PWA-правок**: 559 passed, 2 skipped. Это historical baseline, не полный повторный suite текущей версии.

Доказательства: [browser checks](pwa-evidence-2026-10-02/browser.json), [migration](pwa-evidence-2026-10-02/migration.json), screenshots в той же папке. Lighthouse отдельно не запускался: использованы Chrome CDP manifest/installability diagnostics.

**Не выполнены на физических устройствах:** system install UI/иконка Samsung/iPhone; standalone после reboot; login persistence после reboot; реальные foreground/background/closed push и click; iOS WebKit, Samsung Internet/Edge engines; Dynamic Island/keyboard; реальные GPS allow/deny. Safari/Chrome iOS UA emulation не заменяет настоящий iOS. Поэтому гарантировать полную аппаратную production-ready матрицу пока нельзя.

## Samsung — проверка после deploy

1. Открыть https://www.sortirovka24.kz в обычном актуальном Chrome, вне мессенджера.
2. «Ещё» → «Установить Sortirovka 24» → системный prompt. Если его нет — инструкция/browser menu/diagnostics.
3. Запустить с новой иконки, проверить отсутствие address bar и Standalone=true. Старую обычную ссылку удалить отдельно.
4. Войти → настройки → включить push. Изменять тестовый заказ при открытом, свёрнутом и закрытом UI; клик должен открыть именно заказ.
5. Reboot → проверить запуск/сессию. Airplane mode → offline → online.
6. Samsung Internet: меню ☰ → добавление страницы на главный экран; проверять фактический standalone. Встроенные/устаревшие браузеры могут не давать системной установки.

## iPhone — проверка после deploy

1. Safari → canonical → «Ещё» → assistant.
2. Browser Share → Add to Home Screen → Open as Web App, если есть → Add.
3. Запустить **иконку**, проверить standalone. Обычная Safari-вкладка не заменяет Home Screen Web App для iOS push.
4. Войти → настройки → разрешить push; требуется поддерживаемая iOS/iPadOS (Home Screen Web Push начиная с 16.4).
5. Проверить foreground/background/closed UI, click, reboot, offline, session. Chrome iOS использует собственный Share; если действия нет — Safari.

Нельзя технически принудить установку/permission, убрать browser UI у старой ссылки, обойти Focus/выключенные notifications/сеть, гарантировать сроки фонового push или сделать постоянный background GPS PWA. Force-stop браузера отличается от закрытия UI.

## ENV / release steps

VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT; aliases WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_CONTACT сохранены. Стабильная P-256 пара. Production public endpoint уже enabled=true. EXTERNAL_SIDE_EFFECTS=disabled — local/staging; live требует разрешённой отправки. pywebpush уже в requirements.

Fresh backup → reviewed baseline исторической БД без alembic_version → upgrade head → image с уникальным build ID → проверить health, manifest/SW/offline/v3 icons и RBAC. Cloudflare Cache Everything не применять к SW/manifest/private API. Сессии/подписки массово не удалять. Затем реальные телефонные тесты.

Release включает накопленный этап d0cb4e7 (quote/modifiers/combo/loyalty/payment/CRM). Инструкции: [меню](dam-menu-report-2026-09-28.md), [вся схема и кабинеты](dam-crm-workflow-guide-2026-09-28.md). Реальный Kaspi/Halyk и WhatsApp не считать подключёнными: нужны credentials/contracts/live tests. Неоднозначные legacy bonus/customer связи требуют OWNER-review; данные не удаляются и не назначаются бизнесу произвольно.

Статус публикации и post-deploy proof фиксируются отдельным release-отчётом. Аппаратные ограничения остаются даже при успешном deploy.
