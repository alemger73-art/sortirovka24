"""Add cabinet and OLX-style fields to real_estate."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v0w1x2y3z4a5_add_real_estate_cabinet_fields"
down_revision: Union[str, Sequence[str], None] = "u9v0w1x2y3z4_add_announcement_olx_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("real_estate")}

    rename_pairs = [
        ("estate_type", "re_type"),
        ("floor", "floor_info"),
    ]
    for old, new in rename_pairs:
        if old in cols and new not in cols:
            with op.batch_alter_table("real_estate") as batch:
                batch.alter_column(old, new_column_name=new)

    cols = {c["name"] for c in sa.inspect(bind).get_columns("real_estate")}
    additions = [
        ("user_id", sa.Column("user_id", sa.String(length=255), nullable=True)),
        ("category_id", sa.Column("category_id", sa.Integer(), nullable=True)),
        ("expires_at", sa.Column("expires_at", sa.String(), nullable=True)),
        ("promoted_until", sa.Column("promoted_until", sa.String(), nullable=True)),
        ("promotion_tier", sa.Column("promotion_tier", sa.String(), nullable=True)),
        ("views_count", sa.Column("views_count", sa.Integer(), nullable=True, server_default="0")),
    ]
    for name, col in additions:
        if name not in cols:
            op.add_column("real_estate", col)

    cols = {c["name"] for c in sa.inspect(bind).get_columns("real_estate")}
    indexes = {i["name"] for i in sa.inspect(bind).get_indexes("real_estate")}
    if "category_id" in cols and "ix_real_estate_category_id" not in indexes:
        op.create_index("ix_real_estate_category_id", "real_estate", ["category_id"])
    if "user_id" in cols and "ix_real_estate_user_id" not in indexes:
        op.create_index("ix_real_estate_user_id", "real_estate", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("real_estate")}
    indexes = {i["name"] for i in inspector.get_indexes("real_estate")}

    for idx in ("ix_real_estate_user_id", "ix_real_estate_category_id"):
        if idx in indexes:
            op.drop_index(idx, table_name="real_estate")

    for name in ("views_count", "promotion_tier", "promoted_until", "expires_at", "category_id", "user_id"):
        if name in cols:
            op.drop_column("real_estate", name)

    rename_pairs = [
        ("re_type", "estate_type"),
        ("floor_info", "floor"),
    ]
    cols = {c["name"] for c in sa.inspect(bind).get_columns("real_estate")}
    for old, new in rename_pairs:
        if old in cols and new not in cols:
            with op.batch_alter_table("real_estate") as batch:
                batch.alter_column(old, new_column_name=new)
