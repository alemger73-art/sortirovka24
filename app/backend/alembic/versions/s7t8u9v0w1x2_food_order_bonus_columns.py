"""Add bonus spending columns to food_orders."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s7t8u9v0w1x2_food_order_bonus_columns"
down_revision: Union[str, Sequence[str], None] = "r6s7t8u9v0w1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("food_orders") as batch_op:
        batch_op.add_column(sa.Column("bonus_points_used", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("bonus_discount_amount", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("food_orders") as batch_op:
        batch_op.drop_column("bonus_discount_amount")
        batch_op.drop_column("bonus_points_used")
