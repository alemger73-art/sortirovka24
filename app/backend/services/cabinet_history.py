"""Personal history selection with authoritative account ownership.

Legacy records without an account ID can match the verified account phone.
Read in bounded batches so other customers' newer rows never hide history.
"""
import re
from sqlalchemy import String, cast, or_, select
from utils.phone import matches_phone


def owns_content(user, record_user_id, record_phone):
    if record_user_id is not None and str(record_user_id) != '':
        return str(record_user_id) == str(user.id)
    return matches_phone(record_phone, user.phone)


def legacy_food_id(order):
    if order.order_type != 'food':
        return None
    match = re.search(r'#\s*(\d+)\b', order.details or '')
    return int(match.group(1)) if match else None


async def list_owned_history(db, model, user, *, phone_field='phone', limit=100):
    found = []
    before = None
    owner_column = getattr(model, 'user_id', None)
    while len(found) < limit:
        query = select(model).order_by(model.id.desc()).limit(500)
        if before is not None:
            query = query.where(model.id < before)
        if owner_column is not None:
            # Food order owner IDs are integer in older schemas; account IDs may be UUIDs.
            owner_text = cast(owner_column, String)
            query = query.where(or_(owner_text == str(user.id), owner_column.is_(None), owner_text == ''))
        batch = (await db.execute(query)).scalars().all()
        if not batch:
            break
        for row in batch:
            if owns_content(user, getattr(row, 'user_id', None), getattr(row, phone_field, None)):
                found.append(row)
                if len(found) == limit:
                    break
        before = batch[-1].id
        if len(batch) < 500:
            break
    return found
