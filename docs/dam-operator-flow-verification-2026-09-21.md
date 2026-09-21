# DAM ALEM: operator-managed delivery verification

Base: `8b92a0f`; branch: `codex/dam-operator-flow`. All orders/accounts below are synthetic, in an isolated local SQLite database. No production orders or staff credentials were changed. External side effects were disabled.

## Changes

- Staff creation now explains invalid fields instead of silently disabling submission; failed submissions retain values. Previously `mutate` swallowed an API failure and creation cleared the form regardless.
- Password visibility controls for staff creation/editing and partner password change; existing password/PIN hashes and owner/operator authorization retained.
- Courier routes, application/self-service API and automatic dispatch paused without deleting existing data or implementations. Operator advances delivery through ready → in_progress → done; pickup skips delivery. Version conflicts and terminal-order protection retained.
- Customer delivery charge and courier compensation remain independent. Nullable logistics fields preserve legacy rows. Courier expenses continue through the existing manual expense workflow; this change does not automatically pay a courier or book an expense.
- Customer pickup badges and success status bar no longer imply delivery. Shift and notification timestamps explicitly carry UTC.

## Real browser tests

1. Owner created an employee through Team. A short password produced a field error and retained the form. Show/hide worked. Successful creation appeared in the list.
2. Logged out, signed in as that employee, opened a personal PIN shift. Owner tabs were absent. Refresh retained the open shift.
3. Resident placed pickup order 2 through checkout: item 3,200 + service 320 = 3,520 KZT. Operator accepted, prepared, marked ready, confirmed cash and issued. Double click did not duplicate completion. Customer order page now says “Выдан”.
4. Resident placed delivery order 3 through checkout using a saved test address and successful delivery quote: 3,200 + 320 + 500 = 4,020 KZT. Operator accepted, prepared, marked ready, clicked “Доставка уехала”, confirmed payment and completed. Client saw “В доставке”, then “Доставлен” via automatic refresh.
5. Both persisted through refresh/restart. Closed orders no longer exposed ordinary editing/cancellation actions.
6. Operator closed shift 2. Owner saw a closed 19-minute shift, 13:21–13:41 local time, and named actions against orders 2/3.
7. Owner sales report: three completed/paid orders, 11,060 KZT including the pre-existing fixture order of 3,520. New scenario delta: 7,540. No expense was fabricated; cash difference is explicitly not net profit.
8. Client notifications listed creation, acceptance, preparation, ready, transit (delivery only) and completion with links to the correct orders. No courier application/link in the client cabinet.
9. 390×844 viewport: staff form, operator queue and customer order cards inspected; measured document width 375 versus viewport 390, no horizontal document overflow. Password edit toggle inspected on mobile.
10. Built frontend preview on port 5175: real operator login and persisted closed-shift/order views succeeded. No console error entries from this preview origin in the inspected log. Earlier development HMR errors were observed and cleared on full reload; they are not represented as a clean entire-session console.

## Automated validation

- 33 tests passed in the combined operator-managed-delivery, order-workflow, business and shift suites; two Pydantic deprecation warnings.
- Coverage includes stale/replayed updates (409), premature delivery completion (409), pickup delivery transition (422), terminal-order changes (409), paused courier endpoints (404), staff permissions (403), invalid/duplicate staff (422/409), and password/PIN hashes.
- Free customer delivery with configured courier payout 800 retains payout 800.
- TypeScript application check and Vite production build passed. Existing build warnings: browser compatibility data age, ambiguous utility, mixed sonner import, large chunk.
- A sandboxed pytest attempt failed with Windows temporary-directory permissions; the isolated test run with filesystem access passed. This was not counted as a product test failure.

## Release limits

- Not deployed by this verification. Test results do not establish production readiness of the release.
- Existing Alembic graph has a duplicate revision and a missing parent. Runtime schema synchronization added the nullable columns locally; PostgreSQL staging schema/startup must be verified before release. Do not bypass migration errors or reset production data.
- Real Telegram/push delivery, real payment settlement and real-device keyboard behavior were not exercised. In-app notification persistence and cash recording were exercised.
- Local startup reported missing Cloudinary configuration and unavailable weather networking. These external services were not configured in the isolated fixture.
