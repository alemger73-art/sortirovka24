"""add master_id to master_requests

Revision ID: i4d5e6f7g8h9
Revises: a2b3c4d5e6f7, h3c4d5e6f7g8
Create Date: 2026-06-15 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i4d5e6f7g8h9"
down_revision: Union[str, Sequence[str], None] = ("a2b3c4d5e6f7", "h3c4d5e6f7g8")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("master_requests")}
    if "master_id" not in cols:
        op.add_column("master_requests", sa.Column("master_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("master_requests")}
    if "master_id" in cols:
        op.drop_column("master_requests", "master_id")
