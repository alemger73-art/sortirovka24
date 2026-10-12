"""Durable request delivery and persisted app feedback."""
from alembic import op
import sqlalchemy as sa
revision = "s2420261012_crm_delivery"
down_revision = "dam20261006_pwa_preferences"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("crm_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("sheets_done", sa.Boolean(), nullable=False),
        sa.Column("telegram_done", sa.Boolean(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.Float(), nullable=False),
        sa.Column("dead", sa.Boolean(), nullable=False),
        sa.Column("last_error", sa.String(80), nullable=True),
        sa.UniqueConstraint("source", "source_id", name="uq_crm_source"))
    op.create_index("ix_crm_ready", "crm_deliveries", ["telegram_done", "dead", "next_attempt_at"])
    op.create_table("feedback_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("description", sa.String(), nullable=False),
        *[sa.Column(name, sa.String(), nullable=True) for name in
          ("section", "contact_name", "contact_phone", "page_url", "user_agent", "screenshot_url")],
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False))


def downgrade():
    raise RuntimeError("Preserve request and delivery history; disable worker/flags to roll back")
