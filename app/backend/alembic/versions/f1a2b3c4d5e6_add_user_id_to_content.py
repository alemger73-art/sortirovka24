"""Add user_id to announcements and complaints for account cabinet linking.

Revision ID: f1a2b3c4d5e6
Revises: e8f9a0b1c2d3
Create Date: 2026-06-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("announcements", "complaints"):
        cols = {c["name"] for c in inspector.get_columns(table)}
        if "user_id" not in cols:
            op.add_column(table, sa.Column("user_id", sa.String(length=255), nullable=True))
            op.create_index(f"ix_{table}_user_id", table, ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("announcements", "complaints"):
        cols = {c["name"] for c in inspector.get_columns(table)}
        if "user_id" in cols:
            op.drop_index(f"ix_{table}_user_id", table_name=table)
            op.drop_column(table, "user_id")
