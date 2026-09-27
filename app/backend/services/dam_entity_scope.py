"""Ownership checks for the legacy entity editor used by the DAM owner."""
from fastapi import HTTPException
from sqlalchemy import select
from models.food_restaurants import Food_restaurants
from models.food_items import Food_items
from models.food_categories import Food_categories
from models.banners import Banners
from models.food_item_modifiers import Food_item_modifiers
from models.item_modifier_groups import Item_modifier_groups
from services.food_operations import brand


async def verify_entity_write(db, entity, path_tail, method, body):
    models={'food_items':Food_items,'food_categories':Food_categories,'food_restaurants':Food_restaurants,
            'banners':Banners,'food_item_modifiers':Food_item_modifiers,'item_modifier_groups':Item_modifier_groups}
    if entity not in models:
        return
    if path_tail == 'batch':
        raise HTTPException(403,'Массовые изменения доступны системному администратору')
    restaurants=(await db.execute(select(Food_restaurants.id,Food_restaurants.name,Food_restaurants.merchant_key))).all()
    ids={r.id for r in restaurants if brand(r.name,r.merchant_key)}
    model=models[entity]
    row=await db.get(model,int(path_tail)) if path_tail.isdigit() else None
    if method in ('PUT','PATCH','DELETE') and row is None:
        raise HTTPException(404,'Объект не найден')
    if entity=='food_restaurants':
        if row is None or row.id not in ids:
            raise HTTPException(403,'Доступ только к своему заведению')
        if 'merchant_key' in body and body['merchant_key'] != row.merchant_key:
            raise HTTPException(403,'Нельзя менять принадлежность заведения')
    elif entity=='banners':
        if (row and row.banner_type!='food_delivery') or body.get('banner_type', row.banner_type if row else None)!='food_delivery':
            raise HTTPException(403,'Доступ только к баннерам доставки еды')
    elif entity in ('food_items','food_categories'):
        if row and row.restaurant_id not in ids:
            raise HTTPException(403,'Объект другого заведения')
        if ('restaurant_id' in body or row is None) and body.get('restaurant_id') not in ids:
            raise HTTPException(403,'Укажите своё заведение')
        if entity=='food_items' and body.get('category_id'):
            category=await db.get(Food_categories,body['category_id'])
            if not category or category.restaurant_id not in ids:
                raise HTTPException(403,'Категория другого заведения')
    else:
        for item_id in [row.food_item_id if row else None,body.get('food_item_id')]:
            if item_id is None: continue
            item=await db.get(Food_items,item_id)
            if not item or item.restaurant_id not in ids:
                raise HTTPException(403,'Блюдо другого заведения')
