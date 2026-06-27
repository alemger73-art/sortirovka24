"""Add partner_credentials tables for module-specific partner admin panels."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r6s7t8u9v0w1_add_partner_credentials"
down_revision: Union[str, Sequence[str], None] = "q5r6s7t8u9v0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "partner_credentials",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("partner_type", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("phone"),
    )
    op.create_index("ix_partner_credentials_id", "partner_credentials", ["id"])
    op.create_index("ix_partner_credentials_partner_type", "partner_credentials", ["partner_type"])

    op.create_table(
        "partner_login_attempts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("partner_type", sa.String(length=50), nullable=False),
        sa.Column("login", sa.String(length=255), nullable=False),
        sa.Column("ip_address", sa.String(length=100), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_partner_login_attempts_id", "partner_login_attempts", ["id"])
    op.create_index("ix_partner_login_attempts_partner_type", "partner_login_attempts", ["partner_type"])


def downgrade() -> None:
    op.drop_index("ix_partner_login_attempts_partner_type", table_name="partner_login_attempts")
    op.drop_index("ix_partner_login_attempts_id", table_name="partner_login_attempts")
    op.drop_table("partner_login_attempts")
    op.drop_index("ix_partner_credentials_partner_type", table_name="partner_credentials")
    op.drop_index("ix_partner_credentials_id", table_name="partner_credentials")
    op.drop_table("partner_credentials")
