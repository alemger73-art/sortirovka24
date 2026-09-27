"""Add exact courier money and delivery issue journals; preserve all existing rows."""
from alembic import op
import sqlalchemy as sa

revision='dam20260929_courier_workflow'
down_revision='dam20260928_operator_workflow'
branch_labels=None
depends_on=None

def upgrade():
    bind=op.get_bind()
    # Parents belong to the existing courier architecture; no new order/profile system.
    if not sa.inspect(bind).has_table('courier_ledger'):
        op.create_table('courier_ledger',
            sa.Column('id',sa.Integer(),primary_key=True),
            sa.Column('entry_key',sa.String(160),nullable=False,unique=True),
            sa.Column('courier_id',sa.String(255),sa.ForeignKey('users.id'),nullable=False),
            sa.Column('shift_id',sa.Integer(),sa.ForeignKey('food_shifts.id')),
            sa.Column('task_id',sa.Integer(),sa.ForeignKey('logistics_tasks.id')),
            sa.Column('order_id',sa.Integer(),sa.ForeignKey('food_orders.id')),
            sa.Column('event_type',sa.String(32),nullable=False),sa.Column('amount',sa.Numeric(14,2),nullable=False),
            sa.Column('actor',sa.String(255),nullable=False),sa.Column('actor_id',sa.String(255),nullable=False),
            sa.Column('comment',sa.String(1000),nullable=False),
            sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
            sa.CheckConstraint("event_type IN ('cash_collected','cash_handed_over','cash_adjustment','earning','payout')",name='ck_courier_ledger_type'),
            sa.CheckConstraint("amount >= 0 OR event_type = 'cash_adjustment'",name='ck_courier_ledger_amount'))
        for col in ('courier_id','shift_id','task_id'):op.create_index('ix_courier_ledger_'+col,'courier_ledger',[col])
    if not sa.inspect(bind).has_table('courier_cash_handovers'):
        op.create_table('courier_cash_handovers',
            sa.Column('id',sa.Integer(),primary_key=True),
            sa.Column('courier_id',sa.String(255),sa.ForeignKey('users.id'),nullable=False),
            sa.Column('shift_id',sa.Integer(),sa.ForeignKey('food_shifts.id'),nullable=False),
            sa.Column('active_key',sa.String(255),unique=True),sa.Column('amount',sa.Numeric(14,2),nullable=False),
            sa.Column('status',sa.String(20),nullable=False),
            sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
            sa.Column('confirmed_at',sa.DateTime(timezone=True)),sa.Column('confirmed_by',sa.String(255)))
        op.create_index('ix_courier_cash_handovers_courier_id','courier_cash_handovers',['courier_id'])
    if not sa.inspect(bind).has_table('courier_delivery_issues'):
        op.create_table('courier_delivery_issues',
            sa.Column('id',sa.Integer(),primary_key=True),
            sa.Column('task_id',sa.Integer(),sa.ForeignKey('logistics_tasks.id'),nullable=False),
            sa.Column('order_id',sa.Integer(),sa.ForeignKey('food_orders.id'),nullable=False),
            sa.Column('courier_id',sa.String(255),sa.ForeignKey('users.id'),nullable=False),
            sa.Column('shift_id',sa.Integer(),sa.ForeignKey('food_shifts.id'),nullable=False),
            sa.Column('active_key',sa.String(100),unique=True),sa.Column('reason',sa.String(32),nullable=False),
            sa.Column('comment',sa.String(1000),nullable=False),sa.Column('status',sa.String(20),nullable=False),
            sa.Column('resolution',sa.String(1000)),sa.Column('resolved_by',sa.String(255)),
            sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
            sa.Column('resolved_at',sa.DateTime(timezone=True)))
        for col in ('task_id','order_id'):op.create_index('ix_courier_delivery_issues_'+col,'courier_delivery_issues',[col])

def downgrade():
    raise RuntimeError('Courier money and issue history must not be deleted by a rollback')
