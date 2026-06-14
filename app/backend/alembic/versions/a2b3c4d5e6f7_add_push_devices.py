"""Add push_devices table for native FCM tokens.

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-06-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "push_devices" in inspector.get_table_names():
        return

    op.create_table(
        "push_devices",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_push_devices_token", "push_devices", ["token"], unique=True)
    op.create_index("ix_push_devices_user_id", "push_devices", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "push_devices" not in inspector.get_table_names():
        return
    op.drop_index("ix_push_devices_user_id", table_name="push_devices")
    op.drop_index("ix_push_devices_token", table_name="push_devices")
    op.drop_table("push_devices")
