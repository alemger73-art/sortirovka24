"""Compatibility bridge for historical short revision references.

Keep both IDs resolvable; no schema or user data changes.
"""
revision = 'x2y3z4a5b6c7'
down_revision = 'x2y3z4a5b6c7_repair_banners_columns'
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
