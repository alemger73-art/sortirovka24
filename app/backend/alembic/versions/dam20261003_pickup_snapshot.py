"""Persist the pickup point selected when the customer orders; no guessed coordinates."""
from alembic import op
import sqlalchemy as sa
revision = 'dam20261003_pickup_snapshot'
down_revision = 'dam20261002_loyalty'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('food_orders', sa.Column('pickup_snapshot', sa.JSON(), nullable=True))

def downgrade():
    raise RuntimeError('Pickup history must be preserved; use a forward migration')
