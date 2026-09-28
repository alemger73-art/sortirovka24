"""Business-scoped menu administration. Public catalog never grants write access."""
from fastapi import APIRouter, Depends, Response
from core.database import get_db
from core.food_staff_guard import food_owner
from services import menu_configuration as menu

router = APIRouter(prefix='/api/v1/dam-alem/menu', tags=['dam-menu'])


@router.get('/catalog')
async def public_catalog(response: Response, db=Depends(get_db)):
    response.headers['Cache-Control'] = 'no-store'
    return await menu.catalog(db)


@router.get('/manage')
async def owner_catalog(response: Response, db=Depends(get_db), owner=Depends(food_owner)):
    response.headers['Cache-Control'] = 'no-store'
    return await menu.catalog(db, owner=True)


def actor(claims):
    return {'id': str(claims.get('staff_id') or claims.get('sub')), 'role': claims['access_role']}


@router.post('/groups', status_code=201)
async def create_group(body: menu.GroupInput, db=Depends(get_db), owner=Depends(food_owner)):
    row = await menu.save_group(db, body, actor(owner))
    await db.commit()
    return menu.serial(row)


@router.put('/groups/{row_id}')
async def edit_group(row_id: int, body: menu.GroupInput, db=Depends(get_db), owner=Depends(food_owner)):
    row = await menu.save_group(db, body, actor(owner), row_id)
    await db.commit()
    return menu.serial(row)


@router.post('/items', status_code=201)
async def create_item(body: menu.ItemInput, db=Depends(get_db), owner=Depends(food_owner)):
    row = await menu.save_item(db, body, actor(owner))
    await db.commit()
    return menu.serial(row)


@router.put('/items/{row_id}')
async def edit_item(row_id: int, body: menu.ItemInput, db=Depends(get_db), owner=Depends(food_owner)):
    row = await menu.save_item(db, body, actor(owner), row_id)
    await db.commit()
    return menu.serial(row)


class Selection(menu.Strict):
    id: int
    quantity: int = 1
    modifiers: list[dict] = []
    choices: list[dict] = []


@router.post('/line-quote')
async def line_quote(body: Selection, db=Depends(get_db)):
    # Uses the exact order validator, not a second pricing implementation.
    import json
    from fastapi import HTTPException
    from services.food_order_validation import validate_food_order
    rests = await menu.restaurants(db)
    if not rests:
        raise HTTPException(409, 'Меню временно недоступно')
    _, lines, total = await validate_food_order(db, {
        'restaurant_id': rests[0].id, 'customer_name': 'Расчёт меню', 'customer_phone': '',
        'delivery_method': 'dine_in', 'order_items': json.dumps([body.model_dump()]),
    }, staff_quote=True, catalog_only=True)
    return {'item': lines[0], 'total': total}
