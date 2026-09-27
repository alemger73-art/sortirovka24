"""Add editorial partner profiles without modifying existing entities."""
from alembic import op
import sqlalchemy as sa

revision = "pp20260927_partner_profiles"
down_revision = "m20260927_merge_legacy_heads"
branch_labels = None
depends_on = None


def upgrade():
    # Application bootstrap can already have created this additive table.
    if not sa.inspect(op.get_bind()).has_table("business_showcases"):
        op.create_table("business_showcases",
                        sa.Column("slug", sa.String(80), primary_key=True),
                        sa.Column("content", sa.JSON(), nullable=False),
                        sa.Column("published", sa.Boolean(), nullable=False),
                        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("business_showcases")
