"""Refresh DAM ALEM hero banner to appetizing food photography.

Revision ID: a5b6c7d8e9f0
Revises: z4a5b6c7d8e9
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, None] = "z4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_HERO = (
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1"
    "?auto=format&fit=crop&w=1920&h=820&q=90"
)
_OLD_HERO = (
    "https://mgx-backend-cdn.metadl.com/generate/images/1029162"
    "/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png"
)


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE food_settings
            SET setting_value = :new_url
            WHERE setting_key = 'hero_banner_image'
              AND (
                setting_value IS NULL
                OR setting_value = ''
                OR setting_value = :old_url
                OR setting_value LIKE '%fe194ca1-0095-44bf-a906-e50cb844ad56%'
              )
            """
        ),
        {"new_url": _NEW_HERO, "old_url": _OLD_HERO},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE food_settings
            SET setting_value = :old_url
            WHERE setting_key = 'hero_banner_image'
              AND setting_value = :new_url
            """
        ),
        {"new_url": _NEW_HERO, "old_url": _OLD_HERO},
    )
