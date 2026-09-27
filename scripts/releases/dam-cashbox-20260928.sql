-- Additive expansion for the unversioned legacy database. No Alembic stamp.
-- Adds an empty journal; the owner enters counted cash in the application.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS food_cash_entries (
    id VARCHAR(36) PRIMARY KEY,
    entry_key VARCHAR(160) NOT NULL UNIQUE,
    kind VARCHAR(24) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    recipient VARCHAR(200) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    actor VARCHAR(200) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    shift_id INTEGER REFERENCES food_shifts(id),
    order_id INTEGER REFERENCES food_orders(id),
    expense_id VARCHAR(36) REFERENCES food_expenses(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_food_cash_entries_created_at ON food_cash_entries(created_at);
COMMIT;
