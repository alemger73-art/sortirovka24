"""Add preorders and shift procurement to the existing DAM workflow."""
from alembic import op
import sqlalchemy as sa

revision = 'dam20260928_operator_workflow'
down_revision = 'pp20260927_partner_profiles'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if 'scheduled_for' not in {c['name'] for c in sa.inspect(bind).get_columns('food_orders')}:
        op.add_column('food_orders', sa.Column('scheduled_for', sa.String(40), nullable=True))
        op.create_index('ix_food_orders_scheduled_for', 'food_orders', ['scheduled_for'])
    if not sa.inspect(bind).has_table('food_shift_procurements'):
        op.create_table('food_shift_procurements',
            sa.Column('shift_id', sa.Integer(), sa.ForeignKey('food_shifts.id'), primary_key=True),
            sa.Column('items', sa.JSON(), nullable=False),
            sa.Column('not_required', sa.Boolean(), nullable=False),
            sa.Column('reason', sa.String(500), nullable=False),
            sa.Column('comment', sa.String(1000), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    columns = {c['name']: c for c in sa.inspect(bind).get_columns('food_order_events')}
    with op.batch_alter_table('food_order_events') as batch:
        if 'shift_id' not in columns:
            batch.add_column(sa.Column('shift_id', sa.Integer(), nullable=True))
            batch.create_foreign_key('fk_food_event_shift', 'food_shifts', ['shift_id'], ['id'])
            batch.create_unique_constraint('uq_food_event_shift', ['shift_id'])
        if not columns['order_id']['nullable']:
            batch.alter_column('order_id', existing_type=sa.Integer(), nullable=True)


def downgrade():
    # Preserve procurement/audit history; destructive rollback is deliberately refused.
    raise RuntimeError('This additive migration requires a reviewed data-preserving rollback')
