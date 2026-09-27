# DÄM ALEM owner cabinet — 2026-09-27

## Existing architecture retained

- `PartnerCredentials` holds owner/operator login, bcrypt password and hashed personal PIN. The current database role and active flag are checked for every protected request.
- `Food_orders` remains the order source of truth. `LogisticsTask` links deliveries by `source_type=food_orders` and `source_id`; courier accounts still use `User` + `CourierProfile` and a separate PIN session.
- `FoodShift` and `FoodStaffAction` retain employee/role/name snapshots. Deleting an employee login does not delete their orders or journal.
- `FoodOrderEvent` contains immutable money movements; `FoodExpense` and legacy `FoodRefund` remain in use. No replacement accounting tables or schema migration.
- Owner and operator share existing menu/order/delivery components. The owner landing page is a separate read-only projection, refreshed every 15 seconds, rather than a second order store.

## Behavior

- Owner navigation: home, orders (including delivery view), finances, menu, team, settings. No owner shift/PIN panel; owner mutations do not require a shift.
- Operators must have a personal PIN and an active shift to mutate operational data, including legacy accounts that previously bypassed this when no PIN was set.
- Owner dashboard separates created order count, completed sales, average completed check, receipts, expenses and refunds. Its result is cash movement, not accounting profit or margin.
- Sales use completion date; receipts and refunds use movement date; expenses use the entered business day. All periods use UTC+5. A delivered order without confirmed payment contributes to sales but not receipts, and appears in attention.
- Dashboard counters use exact statuses; the owner’s ready counter includes pickup and delivery (`ready_all`), preserving the operator's existing separate queues.
- Finance adds source and fulfillment breakdowns of completed sales, yesterday shortcut, and automatic refresh. Existing CSV, expense voiding, refund and payroll functions remain.
- Team includes personal names/logins, access status, current shifts, recent activity and couriers. Business-name placeholders fall back to login and request an actual name; no employee names are invented.
- Password forms accept new values only with repeat confirmation. Owner creation does not require a PIN. Courier access remains PIN-only. Dangerous deletion is inside access settings, with a confirmation explaining history preservation.
- Disabling an operator or changing their role closes the active shift with the owner recorded as the closer. Courier revocation is blocked while deliveries remain active; revocation preserves the profile referenced by delivery history.
- Action history can filter dates, staff identity/type, action and order (including linked delivery actions). Existing order-change details distinguish payment and status updates.
- Owner legacy editor requests are checked against the DAM restaurant before modifying items, categories, restaurant or related item links. Foreign restaurant IDs and category moves are rejected. Menu/settings audit records omit values so integration secrets cannot enter the journal.

## Verification

Automated coverage: `test_dam_business`, `test_dam_shifts`, `test_staff_login_flow`, `test_dam_workstation`, `test_dam_order_workflow`, `test_operator_managed_delivery` (40 tests at the main regression run; focused tests repeated after subsequent backend changes).

Coverage includes owner without shift; operator creation, login/change/revocation; wrong PIN, repeated shift open, own shift lifecycle; denied owner APIs for operator; denied DAM APIs for another partner type; denied foreign menu updates; stale order versions; manual order idempotency; delivery assignment and completion; separate payment dates; refunds after paid cancellation/receipt reduction; preserved staff history and hashed credentials; exact filters/source breakdowns.

Browser scenario on isolated SQLite at localhost, external effects disabled:

1. Owner signs in, sees dashboard without PIN, reload preserves owner access.
2. Operator created through the real owner API enters the workstation by PIN and opens a personal shift.
3. Operator creates a 2,600 KZT delivery order using the form (2,000 food + 600 delivery), sends it to kitchen, marks ready and selects the courier.
4. Owner sees the operator on shift and changing order status, with zero sales before completion.
5. Courier enters their separate cabinet with PIN, sees the assigned order, phone, address, items and 2,600 cash due, then clicks Delivered.
6. Owner sees 2,600 sales but zero receipts until operator confirms payment. The unconfirmed completed payment is flagged.
7. Operator confirms payment; owner finance shows 2,600 receipts, operator source and delivery fulfillment.
8. Owner enters a 300 expense without opening a shift; cash result becomes 2,300.

No production test orders, payments or employee credentials were changed.

Final checks: the six-suite regression passed 40 tests; after adding explicit owner-without-PIN creation coverage and hardening inactive-owner handling, all 7 shift tests passed again. TypeScript, ESLint and production frontend build passed. Mobile dashboard, finance and team were inspected at 375 CSS pixels with no page-wide horizontal overflow. Browser refresh and the service-worker update prompt retained the owner session. This change does not require a database migration.

## Boundaries and remaining architectural constraints

- DAM is a single business module, selected by partner type and restaurant merchant key. This is not a generic multi-restaurant SaaS. Expenses, shifts and the legacy courier pool do not have a general `business_id`; separate independent restaurant tenants require an explicit migration and membership model. Other partner-type sessions are rejected from DAM APIs.
- Courier profiles remain part of the existing shared logistics service. This refactor does not silently detach historical couriers from that service or migrate them to a duplicate identity system.
- Unassigned legacy menu rows are retained for platform administration; they are not implicitly claimed by the owner.
- Four-digit PINs have limited entropy; existing device authorization, attempt limits and hashed storage remain important. Concurrent creation can still require manual resolution of duplicate personal PINs; login fails safely on ambiguity.
- Owner attention delay thresholds are explicit heuristics (10 min new, 20 min waiting for courier, 60 min delivery), not a contractual delivery SLA.
- Real push/WhatsApp/SMS delivery and physical-device behavior are outside the isolated browser test; WhatsApp source support does not imply a connected bot.
- Legacy generic menu/settings writes and their audit entry use separate transactions; a journal-write failure is logged without undoing an already completed entity write. A fully atomic audit requires migrating those generic editors to transactional business commands.
- Finance is operational cash reporting, not inventory, tax accounting or profit calculation. Existing legacy missing-date warnings remain visible; dates are never fabricated.
- Build warnings about large chunks, old Browserslist data, an ambiguous Tailwind utility and Pydantic class Config deprecation remain unrelated maintenance items.
- The older advanced modifier-group editor still uses platform-admin-only generic writes for `modifier_groups` / `modifier_options`. Its permissions were not broadened because these global entities lack restaurant ownership. Ordinary item prices, categories and availability retain the existing DAM editor. This advanced editor needs scoped business commands before granting owner write access.
- New owner dashboard copy is currently Russian; existing translated screens retain their language support. A complete Kazakh localization of the new dashboard remains separate work.
