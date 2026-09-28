"""Add payment attempts and closing snapshots without rewriting historical states."""
from alembic import op
import sqlalchemy as sa

revision = 'dam20261001_payment_lifecycle'
down_revision = 'dam20260930_shared_cashbox'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    additions = {
        'food_orders': [sa.Column('cash_given_amount', sa.Float()), sa.Column('change_amount', sa.Float())],
        'food_shifts': [sa.Column('closing_summary', sa.JSON())],
        'food_order_events': [sa.Column('event_type', sa.String(60)), sa.Column('event_key', sa.String(180)), sa.Column('event_data', sa.Text())],
        'logistics_tasks': [sa.Column('handed_at', sa.String(64)), sa.Column('departed_at', sa.String(64)), sa.Column('arrived_at', sa.String(64))],
    }
    for table, columns in additions.items():
        # Some older installations have no logistics module yet; startup's
        # existing metadata.create_all creates absent tables with current fields.
        if not sa.inspect(connection).has_table(table):
            continue
        existing = {c['name'] for c in sa.inspect(connection).get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)
    indexes = {i['name'] for i in sa.inspect(connection).get_indexes('food_order_events')}
    if 'ix_food_order_events_event_type' not in indexes:
        op.create_index('ix_food_order_events_event_type', 'food_order_events', ['event_type'])
    if 'uq_food_order_events_event_key' not in indexes:
        op.create_index('uq_food_order_events_event_key', 'food_order_events', ['event_key'], unique=True)
    if not sa.inspect(connection).has_table('food_payments'):
        op.create_table('food_payments',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('order_id', sa.Integer(), sa.ForeignKey('food_orders.id'), nullable=False),
            sa.Column('user_id', sa.String(255)),
            sa.Column('provider', sa.String(20), nullable=False),
            sa.Column('amount', sa.Numeric(14, 2), nullable=False),
            sa.Column('currency', sa.String(3), nullable=False),
            sa.Column('status', sa.String(20), nullable=False),
            sa.Column('external_id', sa.String(255)),
            sa.Column('created_at', sa.String(40), nullable=False),
            sa.Column('paid_at', sa.String(40)), sa.Column('failed_at', sa.String(40)),
            sa.Column('expired_at', sa.String(40)), sa.Column('refunded_at', sa.String(40)),
            sa.Column('metadata', sa.JSON(), nullable=False),
            sa.UniqueConstraint('provider', 'external_id', name='uq_food_payment_external'))
        op.create_index('ix_food_payments_order_id', 'food_payments', ['order_id'])
    if not sa.inspect(connection).has_table('food_payment_callbacks'):
        op.create_table('food_payment_callbacks',
            sa.Column('key', sa.String(255), primary_key=True),
            sa.Column('payment_id', sa.String(36), sa.ForeignKey('food_payments.id'), nullable=False),
            sa.Column('payload_hash', sa.String(64), nullable=False),
            sa.Column('created_at', sa.String(40), nullable=False))


def downgrade():
    raise RuntimeError('Payment and audit history must not be deleted by downgrade')
