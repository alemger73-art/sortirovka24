"""add salons table

Revision ID: l9m0n1o2p3q4
Revises: k8l9m0n1o2p3
Create Date: 2026-06-18 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l9m0n1o2p3q4"
down_revision: Union[str, Sequence[str], None] = "k8l9m0n1o2p3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "salons" not in inspector.get_table_names():
        op.create_table(
            "salons",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("address", sa.String(), nullable=True),
            sa.Column("district", sa.String(), nullable=True),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("whatsapp", sa.String(), nullable=True),
            sa.Column("instagram", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("services", sa.String(), nullable=True),
            sa.Column("working_hours", sa.String(), nullable=True),
            sa.Column("price_from", sa.String(), nullable=True),
            sa.Column("photo_url", sa.String(), nullable=True),
            sa.Column("gallery_images", sa.String(), nullable=True),
            sa.Column("rating", sa.Float(), nullable=True),
            sa.Column("reviews_count", sa.Integer(), nullable=True),
            sa.Column("verified", sa.Boolean(), nullable=True),
            sa.Column("featured", sa.Boolean(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_salons_id", "salons", ["id"])
        op.create_index("ix_salons_category", "salons", ["category"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "salons" in inspector.get_table_names():
        existing = {ix["name"] for ix in inspector.get_indexes("salons")}
        if "ix_salons_category" in existing:
            op.drop_index("ix_salons_category", table_name="salons")
        if "ix_salons_id" in existing:
            op.drop_index("ix_salons_id", table_name="salons")
        op.drop_table("salons")
