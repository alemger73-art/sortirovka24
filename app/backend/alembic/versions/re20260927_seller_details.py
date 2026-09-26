"""Add explicit seller identity and moderation feedback; preserve legacy rows."""
from alembic import op
import sqlalchemy as sa

revision = 're20260927_seller_details'
down_revision = 'x2y3z4a5b6c7_repair_banners_columns'
branch_labels = None
depends_on = None

def upgrade():
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('real_estate')}
    for name, size in [('seller_type', 20), ('agency_name', 120), ('commission', 120), ('moderation_reason', 1000)]:
        if name not in columns:
            op.add_column('real_estate', sa.Column(name, sa.String(size), nullable=True))

def downgrade():
    for name in ['moderation_reason', 'commission', 'agency_name', 'seller_type']:
        op.drop_column('real_estate', name)
