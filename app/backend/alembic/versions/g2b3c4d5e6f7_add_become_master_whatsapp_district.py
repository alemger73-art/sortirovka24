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
    op.add_column("become_master_requests", sa.Column("whatsapp", sa.String(), nullable=True))
    op.add_column("become_master_requests", sa.Column("district", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("become_master_requests", "district")
    op.drop_column("become_master_requests", "whatsapp")
