# Real estate release verification — 2026-09-27

## Implemented workflow

Authenticated owners/realtors submit listings for moderation. Realtor identity, agency and commission are explicit. Administrators must supply a rejection reason. Authors can correct rejected listings; edits return them to moderation. Only published listings appear publicly. Unpublished listings cannot be extended. Batch endpoints require administrative access.

## Verified

- 44 backend tests passed (estate ownership, moderation, validation, batch authorization, additive schema update, migration URL handling, legacy graph resolution and unversioned database protection).
- Earlier frontend typecheck and production build passed.
- Earlier local browser scenario: mobile author submission, owner cabinet, admin rejection, author correction, approval and public detail; desktop moderation and 375px layout checked.
- Railway production is currently based on `a3d74c8` (SMS registration release), not the real estate branch.
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

Fresh PostgreSQL baseline-to-head migration, full schema equivalence to every historical migration, production release completion, photo upload in hosted staging, and production real-user submission have not been verified by this document.
