"""Add is_visible and residents_count to homepage_stats.

Revision ID: z4a5b6c7d8e9
Revises: y3z4a5b6c7d8
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z4a5b6c7d8e9"
down_revision: Union[str, None] = "y3z4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_column(table: str, name: str, column: sa.Column) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns(table)}
    if name not in cols:
        op.add_column(table, column)


def upgrade() -> None:
    _ensure_column(
        "homepage_stats",
        "is_visible",
        sa.Column("is_visible", sa.Boolean(), nullable=True, server_default=sa.true()),
    )
    _ensure_column(
        "homepage_stats",
        "residents_count",
        sa.Column("residents_count", sa.Integer(), nullable=True, server_default="1000"),
    )


def downgrade() -> None:
    op.drop_column("homepage_stats", "residents_count")
    op.drop_column("homepage_stats", "is_visible")
