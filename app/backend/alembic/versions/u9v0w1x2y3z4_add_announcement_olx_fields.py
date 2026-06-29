"""Add OLX-style fields to announcements."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u9v0w1x2y3z4_add_announcement_olx_fields"
down_revision: Union[str, Sequence[str], None] = "t8u9v0w1x2y3_add_user_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("announcements")}
    additions = [
        ("category_id", sa.Column("category_id", sa.Integer(), nullable=True)),
        ("expires_at", sa.Column("expires_at", sa.String(), nullable=True)),
        ("promoted_until", sa.Column("promoted_until", sa.String(), nullable=True)),
        ("promotion_tier", sa.Column("promotion_tier", sa.String(), nullable=True)),
        ("views_count", sa.Column("views_count", sa.Integer(), nullable=True, server_default="0")),
    ]
    for name, col in additions:
        if name not in cols:
            op.add_column("announcements", col)
    if "category_id" not in cols:
        op.create_index("ix_announcements_category_id", "announcements", ["category_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("announcements")}
    if "ix_announcements_category_id" in {i["name"] for i in inspector.get_indexes("announcements")}:
        op.drop_index("ix_announcements_category_id", table_name="announcements")
    for name in ("views_count", "promotion_tier", "promoted_until", "expires_at", "category_id"):
        if name in cols:
            op.drop_column("announcements", name)
