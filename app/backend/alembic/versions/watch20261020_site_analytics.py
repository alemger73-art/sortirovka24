"""Own anonymous site statistics and the error watch."""
from alembic import op
import sqlalchemy as sa

revision = "watch20261020_site_analytics"
down_revision = "delete20261016_requests"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("site_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("visitor", sa.String(40), nullable=False),
        sa.Column("session", sa.String(40), nullable=False),
        sa.Column("logged_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("path", sa.String(300)),
        sa.Column("referrer", sa.String(120)),
        sa.Column("device", sa.String(12)),
        sa.Column("platform", sa.String(12)),
        sa.Column("browser", sa.String(16)),
        sa.Column("standalone", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("props", sa.Text()))
    op.create_index("ix_site_events_created_at", "site_events", ["created_at"])
    op.create_index("ix_site_events_visitor", "site_events", ["visitor"])
    op.create_index("ix_site_events_kind", "site_events", ["kind"])
    op.create_table("site_errors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("stack", sa.Text()),
        sa.Column("path", sa.String(300)),
        sa.Column("browser", sa.String(60)),
        sa.Column("release", sa.String(40)),
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("visitors", sa.Text()),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="new"),
        sa.Column("notified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("note", sa.Text()))
    op.create_index("ix_site_errors_fingerprint", "site_errors", ["fingerprint"], unique=True)
    op.create_index("ix_site_errors_last_seen", "site_errors", ["last_seen"])


def downgrade():
    op.drop_table("site_errors")
    op.drop_table("site_events")
