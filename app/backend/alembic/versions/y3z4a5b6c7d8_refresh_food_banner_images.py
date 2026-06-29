"""Refresh food_delivery banner images to project CDN.

Revision ID: y3z4a5b6c7d8
Revises: x2y3z4a5b6c7
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "y3z4a5b6c7d8"
down_revision: Union[str, None] = "x2y3z4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CDN = "https://mgx-backend-cdn.metadl.com/generate/images/1029162"
_UPDATES = {
    "−10% с кодом DAMALEM10": f"{_CDN}/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png",
    "Пицца выгоднее на 500 ₸": f"{_CDN}/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png",
    "Комплексный обед −15%": f"{_CDN}/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png",
    "Семейный набор −20%": f"{_CDN}/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png",
    "Подарок к каждому заказу": f"{_CDN}/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png",
    "Донер и шашлык — хиты": f"{_CDN}/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png",
    "DAM ALEM — Доставка еды": f"{_CDN}/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png",
}


def upgrade() -> None:
    conn = op.get_bind()
    for title, image_url in _UPDATES.items():
        conn.execute(
            sa.text(
                """
                UPDATE banners
                SET image_url = :image_url
                WHERE title = :title
                  AND (
                    image_url IS NULL
                    OR image_url = ''
                    OR image_url LIKE '%unsplash.com%'
                  )
                """
            ),
            {"title": title, "image_url": image_url},
        )


def downgrade() -> None:
    pass
