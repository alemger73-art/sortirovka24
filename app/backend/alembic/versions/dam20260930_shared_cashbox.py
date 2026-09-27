"""Immutable physical cash movements for the existing DAM business."""
from alembic import op
import sqlalchemy as sa

revision = 'dam20260930_shared_cashbox'
down_revision = 'dam20260929_courier_workflow'
branch_labels = None
depends_on = None


def upgrade():
    if not sa.inspect(op.get_bind()).has_table('food_cash_entries'):
        op.create_table('food_cash_entries',
            sa.Column('id',sa.String(36),primary_key=True),
            sa.Column('entry_key',sa.String(160),nullable=False,unique=True),
            sa.Column('kind',sa.String(24),nullable=False),
            sa.Column('amount',sa.Numeric(14,2),nullable=False),
            sa.Column('recipient',sa.String(200),nullable=False),
            sa.Column('reason',sa.String(1000),nullable=False),
            sa.Column('actor',sa.String(200),nullable=False),
            sa.Column('actor_id',sa.String(255),nullable=False),
            sa.Column('shift_id',sa.Integer(),sa.ForeignKey('food_shifts.id')),
            sa.Column('order_id',sa.Integer(),sa.ForeignKey('food_orders.id')),
            sa.Column('expense_id',sa.String(36),sa.ForeignKey('food_expenses.id')),
            sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
        op.create_index('ix_food_cash_entries_created_at','food_cash_entries',['created_at'])


def downgrade():
    raise RuntimeError('Cash history must not be discarded by an automatic downgrade')
