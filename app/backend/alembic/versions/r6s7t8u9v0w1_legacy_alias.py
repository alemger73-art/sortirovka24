"""Compatibility bridge for historical short revision references.

Keep both IDs resolvable; no schema or user data changes.
"""
revision = 'r6s7t8u9v0w1'
down_revision = 'r6s7t8u9v0w1_add_partner_credentials'
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
