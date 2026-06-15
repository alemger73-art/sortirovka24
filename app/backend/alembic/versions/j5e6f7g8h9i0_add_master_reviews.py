"""add master_reviews table

Revision ID: j5e6f7g8h9i0
Revises: i4d5e6f7g8h9
Create Date: 2026-06-15 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j5e6f7g8h9i0"
down_revision: Union[str, Sequence[str], None] = "i4d5e6f7g8h9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "master_reviews" not in inspector.get_table_names():
        op.create_table(
            "master_reviews",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("master_id", sa.Integer(), nullable=False),
            sa.Column("reviewer_user_id", sa.String(length=36), nullable=False),
            sa.Column("reviewer_name", sa.String(), nullable=True),
            sa.Column("rating", sa.Integer(), nullable=False),
            sa.Column("comment", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("master_id", "reviewer_user_id", name="uq_master_reviews_master_reviewer"),
        )
        op.create_index("ix_master_reviews_master_id", "master_reviews", ["master_id"])
        op.create_index("ix_master_reviews_reviewer_user_id", "master_reviews", ["reviewer_user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "master_reviews" in inspector.get_table_names():
        op.drop_index("ix_master_reviews_reviewer_user_id", table_name="master_reviews")
        op.drop_index("ix_master_reviews_master_id", table_name="master_reviews")
        op.drop_table("master_reviews")
