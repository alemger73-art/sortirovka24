# Real estate release verification — 2026-09-27

## Implemented workflow

Authenticated owners/realtors submit listings for moderation. Realtor identity, agency and commission are explicit. Administrators must supply a rejection reason. Authors can correct rejected listings; edits return them to moderation. Only published listings appear publicly. Unpublished listings cannot be extended. Batch endpoints require administrative access.

## Verified

- 44 backend tests passed (estate ownership, moderation, validation, batch authorization, additive schema update, migration URL handling, legacy graph resolution and unversioned database protection).
- Earlier frontend typecheck and production build passed.
- Earlier local browser scenario: mobile author submission, owner cabinet, admin rejection, author correction, approval and public detail; desktop moderation and 375px layout checked.
- Before this release, Railway production was based on `a3d74c8` (SMS registration release).
- Direct read-only production query: 108 public tables; no `alembic_version`; `real_estate` has 0 rows and lacks the four new fields.
- Fresh `pg_dump` custom-format backup was downloaded locally, excluded from Git/build uploads.
- Backup successfully restored into temporary `estate_restore_20260927` database on the separate staging PostgreSQL service.
- Additive PostgreSQL DDL for the four estate columns was applied twice. All table row counts were unchanged. This is not a proof that every field in every table was compared.
- Temporary restored database removed; temporary Railway SSH key revoked and local key files removed.

## Migration caveat / release constraint

The historical Alembic graph now resolves 60 revisions into one head. Existing long/short revision identifiers are preserved with compatibility links. The duplicate hero migration has a distinct revision. Database URL resolution now uses DATABASE_URL and historical version identifiers fit VARCHAR(128).

Production was initialized by ORM schema repair, not recorded Alembic migrations. Do not stamp it at head or replay the full historical chain blindly. The new guard refuses unversioned nonempty databases before executing migrations. Existing startup still logs Alembic failure and proceeds through its established ORM schema checks; it has not been converted to fail-closed startup. Full historical baseline reconciliation remains separate outstanding work.

The duplicate historical a5 revision is ambiguous for databases that already recorded it: the graph repair alone does not prove whether the combos data update ran. No replay of that business-data migration was attempted in production.

## Not yet established by these checks

Fresh PostgreSQL baseline-to-head migration, full schema equivalence to every historical migration, photo upload in hosted staging and production real-user submission have not been verified by this document.

## Hosted staging verification

Deployment `ceea5364-7a5a-4cad-a6c5-99ae591bb029` reached SUCCESS. `/health` reports staging, healthy database and isolated target. Public estate API returns 200.

Using the existing staging administrator: created one disposable realtor listing (201), verified unpublished public access returns 404, rejection without a reason returns 422, rejection with a reason returns 200, approval returns 200, public detail preserves agency identity, anonymous batch operation returns 401. Deleted only that test listing (200).

Browser: catalogue and empty state loaded; pressing Publish redirects to `/account?redirect=%2Freal-estate%2Fnew`. At 375px viewport the mobile filters open and measured content width does not exceed viewport width. Viewport was reset after testing.

Production release requested by fast-forward push of `fd0c6dc` to main. Deployment `b0abbe45-6176-45cd-8b6a-4a013ee9d0f5` was building at this checkpoint.

## Production verification

Deployment `b0abbe45-6176-45cd-8b6a-4a013ee9d0f5` reached SUCCESS. Both the custom-domain and Railway-domain health responses report build `fd0c6dc8980fd6124e7cd0f3c1171ded5b93e30b`, healthy service and database OK. Read-only PostgreSQL inspection confirms all four new nullable VARCHAR columns; estate row count remains zero.

Production browser catalogue renders correctly. Public estate API, food-items smoke check and estate/new HTML return 200. Anonymous single and batch create requests return 401. No authorized production test listings were created.

Observed pre-existing configuration issue: the health response labels the production environment `local`; environment naming needs review before changing it, since authentication and runtime settings may depend on it. No claim is made that all production configuration is correct.

Hosted negative tests emit expected HTTP 404/422 outcomes as ERROR-level database log entries; log classification remains noisy and should be corrected separately.
