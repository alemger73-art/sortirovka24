-- Additive expansion for the unversioned legacy database.
-- Matches only the operator/courier changes of this release; does not stamp Alembic.
-- Verified twice on a restored production snapshot before application.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS scheduled_for VARCHAR(40);
CREATE INDEX IF NOT EXISTS ix_food_orders_scheduled_for ON food_orders (scheduled_for);
ALTER TABLE food_order_events ADD COLUMN IF NOT EXISTS shift_id INTEGER;
ALTER TABLE food_order_events ALTER COLUMN order_id DROP NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='food_order_events'::regclass AND conname='fk_food_event_shift') THEN ALTER TABLE food_order_events ADD CONSTRAINT fk_food_event_shift FOREIGN KEY (shift_id) REFERENCES food_shifts(id); END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='food_order_events'::regclass AND conname='uq_food_event_shift') THEN ALTER TABLE food_order_events ADD CONSTRAINT uq_food_event_shift UNIQUE (shift_id); END IF; END $$;

CREATE TABLE IF NOT EXISTS food_shift_procurements (
	shift_id INTEGER NOT NULL,
	items JSON NOT NULL,
	not_required BOOLEAN NOT NULL,
	reason VARCHAR(500) NOT NULL,
	comment VARCHAR(1000) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (shift_id),
	FOREIGN KEY(shift_id) REFERENCES food_shifts (id)
)

;

CREATE TABLE IF NOT EXISTS courier_ledger (
	id SERIAL NOT NULL,
	entry_key VARCHAR(160) NOT NULL,
	courier_id VARCHAR(255) NOT NULL,
	shift_id INTEGER,
	task_id INTEGER,
	order_id INTEGER,
	event_type VARCHAR(32) NOT NULL,
	amount NUMERIC(14, 2) NOT NULL,
	actor VARCHAR(255) NOT NULL,
	actor_id VARCHAR(255) NOT NULL,
	comment VARCHAR(1000) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_courier_ledger_type CHECK (event_type IN ('cash_collected','cash_handed_over','cash_adjustment','earning','payout')),
	CONSTRAINT ck_courier_ledger_amount CHECK (amount >= 0 OR event_type = 'cash_adjustment'),
	UNIQUE (entry_key),
	FOREIGN KEY(courier_id) REFERENCES users (id),
	FOREIGN KEY(shift_id) REFERENCES food_shifts (id),
	FOREIGN KEY(task_id) REFERENCES logistics_tasks (id),
	FOREIGN KEY(order_id) REFERENCES food_orders (id)
)

;
CREATE INDEX IF NOT EXISTS ix_courier_ledger_courier_id ON courier_ledger (courier_id);
CREATE INDEX IF NOT EXISTS ix_courier_ledger_shift_id ON courier_ledger (shift_id);
CREATE INDEX IF NOT EXISTS ix_courier_ledger_task_id ON courier_ledger (task_id);

CREATE TABLE IF NOT EXISTS courier_cash_handovers (
	id SERIAL NOT NULL,
	courier_id VARCHAR(255) NOT NULL,
	shift_id INTEGER NOT NULL,
	active_key VARCHAR(255),
	amount NUMERIC(14, 2) NOT NULL,
	status VARCHAR(20) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	confirmed_at TIMESTAMP WITH TIME ZONE,
	confirmed_by VARCHAR(255),
	PRIMARY KEY (id),
	FOREIGN KEY(courier_id) REFERENCES users (id),
	FOREIGN KEY(shift_id) REFERENCES food_shifts (id),
	UNIQUE (active_key)
)

;
CREATE INDEX IF NOT EXISTS ix_courier_cash_handovers_courier_id ON courier_cash_handovers (courier_id);

CREATE TABLE IF NOT EXISTS courier_delivery_issues (
	id SERIAL NOT NULL,
	task_id INTEGER NOT NULL,
	order_id INTEGER NOT NULL,
	courier_id VARCHAR(255) NOT NULL,
	shift_id INTEGER NOT NULL,
	active_key VARCHAR(100),
	reason VARCHAR(32) NOT NULL,
	comment VARCHAR(1000) NOT NULL,
	status VARCHAR(20) NOT NULL,
	resolution VARCHAR(1000),
	resolved_by VARCHAR(255),
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	resolved_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(task_id) REFERENCES logistics_tasks (id),
	FOREIGN KEY(order_id) REFERENCES food_orders (id),
	FOREIGN KEY(courier_id) REFERENCES users (id),
	FOREIGN KEY(shift_id) REFERENCES food_shifts (id),
	UNIQUE (active_key)
)

;
CREATE INDEX IF NOT EXISTS ix_courier_delivery_issues_order_id ON courier_delivery_issues (order_id);
CREATE INDEX IF NOT EXISTS ix_courier_delivery_issues_task_id ON courier_delivery_issues (task_id);
COMMIT;
