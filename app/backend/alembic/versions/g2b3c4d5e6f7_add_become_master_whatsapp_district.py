"""add whatsapp and district to become_master_requests

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-06-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("become_master_requests")}
    if "whatsapp" not in cols:
        op.add_column("become_master_requests", sa.Column("whatsapp", sa.String(), nullable=True))
    if "district" not in cols:
        op.add_column("become_master_requests", sa.Column("district", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("become_master_requests")}
    if "district" in cols:
        op.drop_column("become_master_requests", "district")
    if "whatsapp" in cols:
        op.drop_column("become_master_requests", "whatsapp")
