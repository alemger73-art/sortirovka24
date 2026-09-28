"""Extend the existing menu; infer legacy scope from restaurant links only."""
from alembic import op
import sqlalchemy as sa

revision = 'dam20261005_menu_configuration'
down_revision = 'dam20261004_notification_outbox'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('food_items', 'modifier_groups', 'modifier_options', 'item_modifier_groups'):
        op.add_column(table, sa.Column('business_id', sa.String(64), nullable=True))
        op.create_index('ix_' + table + '_business_id', table, ['business_id'])
    for table in ('food_items', 'modifier_groups', 'modifier_options'):
        op.add_column(table, sa.Column('archived_at', sa.String(), nullable=True))
    for table in ('food_items', 'modifier_groups'):
        op.add_column(table, sa.Column('menu_version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('food_items', sa.Column('modifiers_enabled', sa.Boolean(), nullable=True))
    op.add_column('food_items', sa.Column('combo_config', sa.JSON(), nullable=True))
    conn = op.get_bind()
    conn.execute(sa.text('UPDATE food_items SET business_id=(SELECT business_id FROM food_restaurants WHERE food_restaurants.id=food_items.restaurant_id)'))
    conn.execute(sa.text('UPDATE food_items SET modifiers_enabled=CASE WHEN EXISTS (SELECT 1 FROM item_modifier_groups WHERE food_item_id=food_items.id) THEN true ELSE false END'))
    conn.execute(sa.text('UPDATE item_modifier_groups SET business_id=(SELECT business_id FROM food_items WHERE food_items.id=item_modifier_groups.food_item_id)'))
    # Never assign a globally shared group to an arbitrary business. A migration
    # rehearsal must resolve ambiguous legacy bindings before production release.
    mixed = conn.execute(sa.text('SELECT modifier_group_id FROM item_modifier_groups WHERE business_id IS NOT NULL GROUP BY modifier_group_id HAVING COUNT(DISTINCT business_id)>1')).first()
    if mixed:
        raise RuntimeError('Modifier group shared by multiple businesses; resolve scope before migrating')
    conn.execute(sa.text('UPDATE modifier_groups SET business_id=(SELECT MIN(business_id) FROM item_modifier_groups WHERE modifier_group_id=modifier_groups.id)'))
    # Older menu editors could create reusable groups before attaching a dish.
    # With exactly one restaurant business, ownership is unambiguous. With
    # multiple businesses leave unbound groups unassigned for explicit review.
    owners = conn.execute(sa.text('SELECT DISTINCT business_id FROM food_restaurants WHERE business_id IS NOT NULL')).scalars().all()
    if len(owners) == 1:
        conn.execute(sa.text('UPDATE modifier_groups SET business_id=:business WHERE business_id IS NULL'), {'business': owners[0]})
    conn.execute(sa.text('UPDATE modifier_options SET business_id=(SELECT business_id FROM modifier_groups WHERE modifier_groups.id=modifier_options.group_id)'))
    op.create_index('ix_menu_binding_item_group', 'item_modifier_groups', ['food_item_id', 'modifier_group_id'])


def downgrade():
    raise RuntimeError('Keep menu configuration and order history; use a forward migration')
