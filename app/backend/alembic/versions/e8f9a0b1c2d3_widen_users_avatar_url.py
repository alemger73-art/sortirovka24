"""Widen users.avatar_url to Text for cloud storage URLs.

Revision ID: e8f9a0b1c2d3
Revises: d4a1b2c3e5f6
Create Date: 2026-06-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, None] = "d4a1b2c3e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.alter_column(
            "users",
            "avatar_url",
            existing_type=sa.String(length=1024),
            type_=sa.Text(),
            existing_nullable=True,
        )
    else:
        # SQLite stores TEXT already; no-op for dev/test DBs.
        pass


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.alter_column(
            "users",
            "avatar_url",
            existing_type=sa.Text(),
            type_=sa.String(length=1024),
            existing_nullable=True,
        )
