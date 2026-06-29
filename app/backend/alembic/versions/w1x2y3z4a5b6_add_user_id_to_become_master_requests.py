"""Add user_id to become_master_requests for account linking."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w1x2y3z4a5b6"
down_revision: Union[str, None] = "v0w1x2y3z4a5_add_real_estate_cabinet_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("become_master_requests")}
    if "user_id" not in cols:
        op.add_column("become_master_requests", sa.Column("user_id", sa.String(length=255), nullable=True))
        op.create_index("ix_become_master_requests_user_id", "become_master_requests", ["user_id"], unique=False)

    # Link legacy rows to accounts by normalized phone when unambiguous.
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text("""
                UPDATE become_master_requests AS b
                SET user_id = u.id
                FROM users AS u
                WHERE b.user_id IS NULL
                  AND b.phone IS NOT NULL
                  AND u.phone IS NOT NULL
                  AND regexp_replace(b.phone, '[^0-9]', '', 'g') = regexp_replace(u.phone, '[^0-9]', '', 'g')
            """)
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("become_master_requests")}
    if "user_id" in cols:
        op.drop_index("ix_become_master_requests_user_id", table_name="become_master_requests")
        op.drop_column("become_master_requests", "user_id")
