"""Read-only module visibility for account history and notifications."""
from sqlalchemy import select, or_, and_, not_, func
from models.module_settings import ModuleSettings
from models.taxi import TaxiSettings
from services.module_settings import MODULE_KEYS

ALIASES = {'park': 'food', 'master': 'masters', 'master_requests': 'masters',
           'become_master_requests': 'masters', 'taxi_rides': 'taxi',
           'logistics_tasks': 'food', 'logistics': 'food'}


async def availability(db):
    flags = {key: True for key in MODULE_KEYS}
    for row in (await db.scalars(select(ModuleSettings))).all():
        if row.key in flags:
            flags[row.key] = row.value == 'true'
    taxi = await db.scalar(select(TaxiSettings).where(TaxiSettings.key == 'enabled'))
    flags['taxi'] = bool(taxi and str(taxi.value).lower() in ('true', '1', 'yes'))
    return flags


def module_for_source(source):
    source = str(source or '').removesuffix('_orders')
    return ALIASES.get(source, source)


def source_visible(source, flags):
    return flags.get(module_for_source(source), False)


def notification_condition(flags):
    from models.user_notifications import UserNotification as N
    exclusions = []
    for key, enabled in flags.items():
        if enabled:
            continue
        names = {key, key + '_orders'} | {alias for alias, target in ALIASES.items() if target == key}
        paths = [f'/{key}', f'/cabinet/orders/{key}']
        if key == 'pharmacy': paths.append('/apteka')
        if key == 'masters': paths += ['/cabinet/master', '/become-master']
        if key == 'food': paths += ['/delivery', '/cabinet/courier', '/cabinet/orders/park']
        exclusions += [func.coalesce(N.entity_type, '').in_(names), func.coalesce(N.category, '').in_(names)]
        for path in paths:
            value = func.coalesce(N.path, '')
            exclusions += [value == path, value.like(path + '/%'), value.like(path + '?%')]
    if not all(flags.values()):
        # Legacy store/bonus messages without a source cannot be safely attributed.
        exclusions.append(and_(N.category.in_(['store', 'bonus']), func.coalesce(N.entity_type, '') == '',
                               or_(func.coalesce(N.path, '') == '', N.path == '/cabinet?tab=bonuses')))
    return not_(or_(*exclusions)) if exclusions else True
