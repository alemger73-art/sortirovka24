# Финальные проверки courier + receipt, 28.09.2026

Production не использовался для бизнес-сценариев и записей. Единственная дополнительная live-проверка — публичный GET `/food` с браузерным User-Agent: HTTP 200, canonical витрины подтверждён. Пользовательские пароли, PIN и реальные контакты в доказательства не включены. API browser suites подменены; API/ORM отдельно проверяются backend suite на временной SQLite.

- `courier-receipt-full-final.log`: полный backend, **393 passed / 0 failed / 1 skipped**, 41 warning. Запуск из `app/backend`: `.venv/Scripts/python -m pytest -q`, `DATABASE_URL=sqlite+aiosqlite:///:memory:`, `INTEGRITY_BASE_URL` пустой.
- `courier-browser-final.log`: `playwright.courier.config.ts`, **30 passed**; 320/390/412/768/1440 px.
- `courier-regression-final.log`: `playwright.dam-operations.config.ts`, **104 passed**; 320/390/768/1440 px.
- `courier-stage1-regression.log`: `playwright.operator-stage1.config.ts`, **10 passed**.
- `courier-stage2-regression.log`: `playwright.operator-stage2.config.ts`, **32 passed** (operator-stage2 + operator-ui).
- `receipt-tests-final.log`: `playwright.receipt.config.ts`, **25 passed**. Включает pure data checks, настоящий Chromium, browser/native HTML, QR decode и print PDF.
- `receipt-typecheck-final.log`: пустой лог успешного `node node_modules/typescript/bin/tsc -b`, exit 0.
- `receipt-lint-final.log`: пустой лог успешного штатного `node node_modules/eslint/bin/eslint.js --quiet ./src`, exit 0.
- `receipt-build-final.log`: `node node_modules/vite/bin/vite.js build`, exit 0; финальный шаблон с 48-мм содержимым на 58-мм бумаге.
- `receipt-android-build.log`: Gradle `:app:compileDebugJavaWithJavac`, **BUILD SUCCESSFUL**, 147 tasks. Реальный принтер и iOS не проверены.

Playwright запускается из `app/frontend`: `node node_modules/@playwright/test/cli.js test --config=<config>`. Receipt config отдельно собирает библиотечный harness; остальные suites используют production preview. Production build нельзя пересобирать одновременно с suites, которые читают его chunks.

Совокупно в перечисленных Playwright suites **201 passed / 0 failed / 0 skipped**. Последняя правка CSS полей/переносов не меняла логику courier/owner/operator; после неё повторно пройдены receipt suite, TypeScript, lint и production build.

PDF-артефакты находятся в `output/pdf/dam-alem-receipt-{cash,paid,long}.pdf`. `pypdf` подтвердил по одной странице, наличие footer/бренда/домена. Poppler создал PNG для визуального осмотра. Отдельный Chromium/canvas + jsQR декодировал **растры cash и paid PDF** в `https://www.sortirovka24.kz/food`.

Физическая печать Windows XP-58, native print на устройстве, background push и конкурентные транзакции PostgreSQL остаются следующей проверкой на staging. Зелёный локальный suite не выдаётся за прохождение этих проверок.
