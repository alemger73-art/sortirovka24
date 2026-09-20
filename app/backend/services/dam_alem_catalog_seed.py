"""Apply the approved menu without deleting products or order history."""
import logging
import os
from datetime import datetime, timezone
from sqlalchemy import select, delete
from models.food_categories import Food_categories
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.food_settings import Food_settings
from models.modifier_groups import Modifier_groups
from models.modifier_options import Modifier_options
from models.item_modifier_groups import Item_modifier_groups
from services.dam_alem_catalog_data import CATEGORIES, build_items, build_modifier_groups

logger=logging.getLogger(__name__)
VERSION='approved-menu-2026-09-20'
MARKER='dam_alem_catalog_revision'

async def _find_dam_alem_restaurant(db):
 for row in (await db.scalars(select(Food_restaurants))).all():
  name=(row.name or '').lower().replace(' ','')
  if any(x in name for x in ('damalem','dämalem','дамалем','алемфуд','alemfood','dämәлемі')):return row
 return None

async def seed_dam_alem_catalog(db, *, replace=True):
 restaurant=await _find_dam_alem_restaurant(db)
 if not restaurant:
  # A clean staging/new installation has no mock rows when
  # MGX_IGNORE_INIT_DATA is enabled. Bootstrap DAM ALEM only when the
  # restaurant table is completely empty; never add it to an unrelated
  # multi-restaurant database implicitly.
  existing=await db.scalar(select(Food_restaurants.id).limit(1))
  if existing is not None:raise ValueError('Existing DAM ALEM restaurant not found')
  restaurant=Food_restaurants(
   name='DAM ALEM 2.0',merchant_key='dam_alem',photo='',
   description='Доставка еды по Сортировке №1',
   whatsapp_phone='+77470304096',working_hours='10:00 – 22:00',
   min_order=2000,delivery_time='35–45 мин',
   cuisine_type='UFO-бургеры, пицца, закуски и напитки',rating=5,
   is_active=True,sort_order=1,created_at=datetime.now(timezone.utc).isoformat(),
  )
  db.add(restaurant);await db.flush()
 # Serialize concurrent startup workers; all content and the marker commit together.
 await db.execute(select(Food_restaurants.id).where(Food_restaurants.id==restaurant.id).with_for_update())
 marker=await db.scalar(select(Food_settings).where(Food_settings.setting_key==MARKER))
 if marker and marker.setting_value==VERSION:
  return {'restaurant_id':restaurant.id,'already_applied':True}
 rid=restaurant.id;now=datetime.now(timezone.utc).isoformat()
 old_categories=(await db.scalars(select(Food_categories).where((Food_categories.restaurant_id==rid) | Food_categories.restaurant_id.is_(None)))).all()
 old_items=(await db.scalars(select(Food_items).where((Food_items.restaurant_id==rid) | Food_items.restaurant_id.is_(None)))).all()
 archived=sum(x.is_active is not False for x in old_items)
 for x in old_items:x.is_active=False
 for x in old_categories:x.is_active=False
 category_ids={}
 for slug,name,sort,icon,kind,active in CATEGORIES:
  row=next((x for x in old_categories if x.slug==slug),None)
  if row is None:
   row=Food_categories(restaurant_id=rid,slug=slug,created_at=now);db.add(row)
  row.restaurant_id=rid;row.name=name;row.sort_order=sort;row.icon=icon;row.category_type=kind;row.is_active=True
  await db.flush();category_ids[slug]=row.id
 groups={}
 for g in build_modifier_groups():
  row=Modifier_groups(name=g['name'],type=g['type'],is_required=g['is_required'],min_select=g['min_select'],max_select=g['max_select'],sort_order=len(groups),is_active=True,created_at=now)
  db.add(row);await db.flush();groups[g['key']]=row.id
  for n,opt in enumerate(g['options']):db.add(Modifier_options(group_id=row.id,name=opt['name'],price=opt['price'],sort_order=n,is_active=True,created_at=now))
 reused=set();links=0
 for item in build_items():
  # Only exact identity matches: uncertain old photos are never copied to another dish.
  cid=category_ids[item['category_slug']]
  row=next((x for x in old_items if x.id not in reused and x.name==item['name'] and x.category_id==cid),None)
  if row is None:
   row=Food_items(restaurant_id=rid,created_at=now,image_url='');db.add(row)
  else:reused.add(row.id)
  for key in ('name','description','price','sort_order','weight','available','is_combo','sales_department'):setattr(row,key,item[key])
  row.restaurant_id=rid;row.category_id=cid;row.is_active=True;row.is_recommended=False;row.is_popular=False
  await db.flush()
  # Links are catalog configuration, not order snapshots. Never delete shared group definitions.
  await db.execute(delete(Item_modifier_groups).where(Item_modifier_groups.food_item_id==row.id))
  for n,key in enumerate(item['mod_groups']):
   db.add(Item_modifier_groups(food_item_id=row.id,modifier_group_id=groups[key],sort_order=n,created_at=now));links+=1
 if marker is None:
  marker=Food_settings(setting_key=MARKER,is_active=True);db.add(marker)
 marker.setting_value=VERSION
 await db.commit()
 return dict(restaurant_id=rid,items=37,categories=8,archived=archived-len(reused),modifier_groups=len(groups),item_modifier_links=links,unpriced=3)

async def ensure_dam_alem_catalog(*, force=False):
 from core.database import db_manager
 if os.getenv('DAM_ALEM_SEED_CATALOG','').lower()=='skip' or not db_manager.async_session_maker:return None
 async with db_manager.async_session_maker() as db:
  if not await _find_dam_alem_restaurant(db):return None
  result=await seed_dam_alem_catalog(db)
  logger.info('DAM ALEM approved menu: %s',result)
  return result
