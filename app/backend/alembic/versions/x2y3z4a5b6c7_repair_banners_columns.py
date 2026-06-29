"""Ensure banners marketing columns exist and widen URL fields to Text.

Revision ID: x2y3z4a5b6c7_repair_banners_columns
Revises: w1x2y3z4a5b6
Create Date: 2026-06-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "x2y3z4a5b6c7_repair_banners_columns"
down_revision: Union[str, None] = "w1x2y3z4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_column(table: str, name: str, column_type: sa.types.TypeEngine) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns(table)}
    if name not in cols:
        op.add_column(table, sa.Column(name, column_type, nullable=True))


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    _ensure_column("banners", "banner_type", sa.String())
    _ensure_column("banners", "banner_text", sa.String())
    _ensure_column("banners", "subtitle", sa.String())
    _ensure_column("banners", "button_text", sa.String())
    _ensure_column("banners", "button_url", sa.String())
    _ensure_column("banners", "link_url", sa.String())

    if dialect == "postgresql":
        for col in ("image_url", "link_url", "button_url"):
            op.execute(sa.text(f'ALTER TABLE banners ALTER COLUMN "{col}" TYPE TEXT'))


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.alter_column("banners", "button_url", existing_type=sa.Text(), type_=sa.String(), existing_nullable=True)
        op.alter_column("banners", "link_url", existing_type=sa.Text(), type_=sa.String(), existing_nullable=True)
        op.alter_column("banners", "image_url", existing_type=sa.Text(), type_=sa.String(), existing_nullable=True)
