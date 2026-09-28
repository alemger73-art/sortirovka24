"""Atomic notification outbox in the existing user inbox."""
from alembic import op
import sqlalchemy as sa
revision='dam20261004_notification_outbox'
down_revision='dam20261003_pickup_snapshot'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('user_notifications',sa.Column('push_status',sa.String(20),nullable=False,server_default='none'))
    op.add_column('user_notifications',sa.Column('push_attempts',sa.Integer(),nullable=False,server_default='0'))
    op.add_column('user_notifications',sa.Column('push_claimed_at',sa.DateTime(timezone=True),nullable=True))
    op.create_index('ix_user_notifications_push_status','user_notifications',['push_status'])

def downgrade():
    raise RuntimeError('Preserve notification delivery history; use a forward migration')
