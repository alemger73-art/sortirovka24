"""add volna alcohol store tables

Revision ID: p4q5r6s7t8u9
Revises: o3p4q5r6s7t8_add_business_partner_requests
Create Date: 2026-06-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p4q5r6s7t8u9"
down_revision: Union[str, Sequence[str], None] = "o3p4q5r6s7t8_add_business_partner_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "volna_categories" not in tables:
        op.create_table(
            "volna_categories",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("image_url", sa.String(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_volna_categories_id", "volna_categories", ["id"])

    if "volna_products" not in tables:
        op.create_table(
            "volna_products",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("category_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("price", sa.Float(), nullable=True),
            sa.Column("weight", sa.String(), nullable=True),
            sa.Column("image_url", sa.String(), nullable=True),
            sa.Column("is_popular", sa.Boolean(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_volna_products_id", "volna_products", ["id"])

    if "volna_orders" not in tables:
        op.create_table(
            "volna_orders",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("customer_name", sa.String(), nullable=True),
            sa.Column("customer_phone", sa.String(), nullable=True),
            sa.Column("customer_address", sa.String(), nullable=True),
            sa.Column("payment_method", sa.String(), nullable=True),
            sa.Column("comment", sa.String(), nullable=True),
            sa.Column("order_items", sa.String(), nullable=True),
            sa.Column("total_amount", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_volna_orders_id", "volna_orders", ["id"])

    if "volna_settings" not in tables:
        op.create_table(
            "volna_settings",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("key", sa.String(), nullable=True),
            sa.Column("value", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_volna_settings_id", "volna_settings", ["id"])
        op.create_index("ix_volna_settings_key", "volna_settings", ["key"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    for table in ("volna_settings", "volna_orders", "volna_products", "volna_categories"):
        if table in tables:
            existing = {ix["name"] for ix in inspector.get_indexes(table)}
            for ix_name in list(existing):
                op.drop_index(ix_name, table_name=table)
            op.drop_table(table)
