"""Extend existing push devices; do not create a parallel subscription store."""
from alembic import op
import sqlalchemy as sa
revision = 'dam20261006_pwa_preferences'
down_revision = 'dam20261005_menu_configuration'
branch_labels = None
depends_on = None
def upgrade():
    op.add_column('push_devices', sa.Column('browser', sa.String(24), nullable=True))
    op.add_column('push_devices', sa.Column('device_platform', sa.String(24), nullable=True))
    op.add_column('push_devices', sa.Column('preferences', sa.JSON(), nullable=True))
    op.add_column('push_devices', sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True))
def downgrade():
    for name in ('last_used_at', 'preferences', 'device_platform', 'browser'):
        op.drop_column('push_devices', name)
