"""Durable account deletion queue."""
from alembic import op
import sqlalchemy as sa

revision = "delete20261016_requests"
down_revision = "dam20261006_pwa_preferences"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("account_deletion_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("processed_by", sa.String(255)),
        sa.Column("processing_evidence", sa.Text()),
        sa.Column("retained_records", sa.JSON()))
    op.create_index("ix_account_deletion_requests_status", "account_deletion_requests", ["status"])


def downgrade():
    op.drop_index("ix_account_deletion_requests_status", table_name="account_deletion_requests")
    op.drop_table("account_deletion_requests")
