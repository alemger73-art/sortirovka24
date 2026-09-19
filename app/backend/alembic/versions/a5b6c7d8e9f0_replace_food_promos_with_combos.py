"""Replace DAM ALEM promo banners with editable product combos.

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


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        UPDATE food_items
        SET name = CASE name
            WHEN 'Комбо куриный' THEN 'Орбита Чикен'
            WHEN 'Комбо говяжий' THEN 'Орбита Биф'
            ELSE name
        END,
        description = CASE name
            WHEN 'Комбо куриный' THEN 'Куриный UFO-бургер, хрустящий картофель фри, соус и Coca-Cola 0,5 л — готовый набор для одного.'
            WHEN 'Комбо говяжий' THEN 'Говяжий UFO-бургер, хрустящий картофель фри, соус и Coca-Cola 0,5 л — сытный готовый набор.'
            ELSE description
        END
        WHERE name IN ('Комбо куриный', 'Комбо говяжий')
    """))

    # This is only the storefront carousel. Promo codes remain available in the cart.
    conn.execute(sa.text("""
        UPDATE banners
        SET active = FALSE
        WHERE banner_type = 'food_delivery'
          AND (
            COALESCE(button_url, link_url, '') LIKE '/food#promo=%'
            OR COALESCE(button_url, link_url, '') = '/food#gifts'
            OR title IN ('Подарок на выбор от 5 000 ₸', 'Семейный набор −20%', 'Заказ выгоднее на 500 ₸', 'DAM ALEM — Доставка еды')
          )
    """))

    for title, item_name, subtitle in (
        ('Орбита Чикен', 'Орбита Чикен', 'Куриный UFO-бургер · фри · соус · Coca-Cola 0,5 л'),
        ('Орбита Биф', 'Орбита Биф', 'Говяжий UFO-бургер · фри · соус · Coca-Cola 0,5 л'),
    ):
        conn.execute(sa.text("""
            INSERT INTO banners (title, banner_text, subtitle, image_url, link_url, button_text, button_url, banner_type, active, created_at)
            SELECT :title, :subtitle, :subtitle, COALESCE(image_url, ''), '/food#product=' || CAST(id AS TEXT), 'В корзину', '/food#product=' || CAST(id AS TEXT), 'food_delivery', TRUE, '2026-09-19T00:00:00Z'
            FROM food_items
            WHERE name = :item_name
              AND NOT EXISTS (SELECT 1 FROM banners WHERE title = :title AND banner_type = 'food_delivery')
            LIMIT 1
        """), {"title": title, "item_name": item_name, "subtitle": subtitle})


def downgrade() -> None:
    pass
