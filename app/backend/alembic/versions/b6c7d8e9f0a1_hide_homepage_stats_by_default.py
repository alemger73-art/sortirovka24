"""Hide homepage stats on the hero by default.

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "homepage_stats" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("homepage_stats")}
    if "is_visible" not in cols:
        return

    homepage_stats = sa.table("homepage_stats", sa.column("is_visible", sa.Boolean()))
    op.execute(homepage_stats.update().values(is_visible=False))

    if bind.dialect.name != "sqlite":
        op.alter_column(
            "homepage_stats",
            "is_visible",
            existing_type=sa.Boolean(),
            existing_nullable=True,
            server_default=sa.false(),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "homepage_stats" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("homepage_stats")}
    if "is_visible" not in cols:
        return
    if bind.dialect.name != "sqlite":
        op.alter_column(
            "homepage_stats",
            "is_visible",
            existing_type=sa.Boolean(),
            existing_nullable=True,
            server_default=sa.true(),
        )
