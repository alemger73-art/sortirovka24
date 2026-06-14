"""add sort_order to directory_entries

Revision ID: d4a1b2c3e5f6
Revises: 27d658a190e2
Create Date: 2026-06-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a1b2c3e5f6'
down_revision: Union[str, Sequence[str], None] = '27d658a190e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('directory_entries', sa.Column('sort_order', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('directory_entries', 'sort_order')
