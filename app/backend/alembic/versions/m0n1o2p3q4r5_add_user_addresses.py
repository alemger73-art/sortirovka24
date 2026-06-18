"""add user_addresses table

Revision ID: m0n1o2p3q4r5
Revises: l9m0n1o2p3q4
Create Date: 2026-06-18 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m0n1o2p3q4r5"
down_revision: Union[str, Sequence[str], None] = "l9m0n1o2p3q4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "user_addresses" not in inspector.get_table_names():
        op.create_table(
            "user_addresses",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(length=255), nullable=False),
            sa.Column("label", sa.String(length=120), nullable=True),
            sa.Column("address", sa.String(length=500), nullable=False),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("lat", sa.Float(), nullable=True),
            sa.Column("lng", sa.Float(), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_user_addresses_id", "user_addresses", ["id"])
        op.create_index("ix_user_addresses_user_id", "user_addresses", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "user_addresses" in inspector.get_table_names():
        existing = {ix["name"] for ix in inspector.get_indexes("user_addresses")}
        if "ix_user_addresses_user_id" in existing:
            op.drop_index("ix_user_addresses_user_id", table_name="user_addresses")
        if "ix_user_addresses_id" in existing:
            op.drop_index("ix_user_addresses_id", table_name="user_addresses")
        op.drop_table("user_addresses")
