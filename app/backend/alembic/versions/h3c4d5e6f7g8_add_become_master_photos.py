"""add photo_url and gallery_images to become_master_requests

Revision ID: h3c4d5e6f7g8
Revises: g2b3c4d5e6f7
Create Date: 2026-06-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h3c4d5e6f7g8"
down_revision: Union[str, Sequence[str], None] = "g2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("become_master_requests", sa.Column("photo_url", sa.String(), nullable=True))
    op.add_column("become_master_requests", sa.Column("gallery_images", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("become_master_requests", "gallery_images")
    op.drop_column("become_master_requests", "photo_url")
