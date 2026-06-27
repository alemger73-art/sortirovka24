"""Add user_notifications table for personal cabinet push history."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t8u9v0w1x2y3_add_user_notifications"
down_revision: Union[str, Sequence[str], None] = "s7t8u9v0w1x2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("event_key", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("path", sa.String(length=512), nullable=True),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "event_key", name="uq_user_notifications_event"),
    )
    op.create_index("ix_user_notifications_user_id", "user_notifications", ["user_id"])
    op.create_index("ix_user_notifications_category", "user_notifications", ["category"])
    op.create_index("ix_user_notifications_event_key", "user_notifications", ["event_key"])
    op.create_index("ix_user_notifications_is_read", "user_notifications", ["is_read"])


def downgrade() -> None:
    op.drop_index("ix_user_notifications_is_read", table_name="user_notifications")
    op.drop_index("ix_user_notifications_event_key", table_name="user_notifications")
    op.drop_index("ix_user_notifications_category", table_name="user_notifications")
    op.drop_index("ix_user_notifications_user_id", table_name="user_notifications")
    op.drop_table("user_notifications")
