"""Rename the food brand in existing presentation data.

Only presentation fields are changed; order history and technical identifiers stay intact.
"""
import re

import sqlalchemy as sa
from alembic import op

revision = 'c7d8e9f0a1b2_food_rebrand'
down_revision = 'b6c7d8e9f0a1'
branch_labels = None
depends_on = None

BRAND = 'DAM ALEM 2.0'
TAGLINE = 'Доставка еды по Сортировке №1'
OLD = re.compile(r'(?<![\w])(?:алем[ -]+фуд|alem[ -]+food|дам\s*алем(?:\s*2\.0)?|dam\s*alem(?:\s*2\.0)?)(?![\w])', re.IGNORECASE)


def rename(value):
    if not isinstance(value, str):
        return value
    return OLD.sub(BRAND, value).replace('Доставка еды №1 в Сортировке', TAGLINE).replace('доставка еды №1 в Сортировке', 'доставка еды по Сортировке №1')


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    fields = {
        'food_restaurants': ('name', 'description'),
        'food_settings': ('setting_value',),
        'banners': ('title', 'subtitle', 'banner_text', 'button_text'),
        'categories': ('name', 'description'),
        'partner_credentials': ('display_name',),
    }
    for name, editable in fields.items():
        if name not in tables:
            continue
        table = sa.Table(name, sa.MetaData(), autoload_with=bind)
        if 'id' not in table.c:
            continue
        for row in bind.execute(sa.select(table)).mappings():
            if name == 'food_restaurants' and not OLD.fullmatch((row.get('name') or '').strip()):
                continue
            if name == 'partner_credentials' and row.get('partner_type') != 'dam_alem':
                continue
            if name == 'food_settings' and row.get('setting_key') not in {'hero_banner_title', 'hero_banner_subtitle', 'referral_share_text', 'promo_slides'}:
                continue
            # Only brand-bearing category/banner copy is replaced, never links or images.
            changes = {key: rename(row[key]) for key in editable if key in row and rename(row[key]) != row[key]}
            if name == 'food_settings' and row.get('setting_key') == 'hero_banner_subtitle' and row.get('setting_value') == 'Горячая еда с доставкой · 35–45 мин · Сортировка':
                changes['setting_value'] = TAGLINE
            if changes:
                bind.execute(table.update().where(table.c.id == row['id']).values(**changes))


def downgrade():
    # Data rename is intentionally retained: original spellings cannot be recovered.
    pass
