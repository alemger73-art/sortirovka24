import json
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base
from models.food_orders import Food_orders
from models.banners import Banners
from services.dam_alem_catalog_seed import seed_dam_alem_catalog, Food_items, Food_categories, Food_restaurants, Modifier_groups, Modifier_options, Item_modifier_groups, Food_settings
from services.food_order_validation import validate_food_order
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_menu_prices_modifiers_archiving_history_and_restart():
 engine=create_async_engine('sqlite+aiosqlite:///:memory:')
 async with engine.begin() as c:await c.run_sync(Base.metadata.create_all)
 maker=async_sessionmaker(engine,expire_on_commit=False)
 async with maker() as db:
  db.add(Food_restaurants(id=1,name='DAM ALEM 2.0',min_order=0))
  db.add_all([Food_items(id=1,restaurant_id=1,name='Бабл-ти',is_active=True),Food_items(id=2,name='Мороженое',is_active=True),Food_items(id=3,restaurant_id=99,name='Другой ресторан',is_active=True)])
  snapshot='[{"id":1,"name":"Бабл-ти","price":700}]'
  db.add(Food_orders(id=1,order_items=snapshot,total_amount=700))
  await db.commit()
  result=await seed_dam_alem_catalog(db)
  assert result['archived']==2
  products=(await db.scalars(select(Food_items).where(Food_items.restaurant_id==1,Food_items.is_active==True))).all()
  assert len(products)==37
  assert sum(x.available for x in products)==34
  assert {x.name for x in products if x.is_combo}=={'Орбита Чикен','Орбита Биф'}
  assert (await db.get(Food_items,1)).is_active is False
  assert (await db.get(Food_items,2)).is_active is False
  assert (await db.get(Food_items,3)).is_active is True
  assert (await db.get(Food_orders,1)).order_items==snapshot
  categories=(await db.scalars(select(Food_categories).where(Food_categories.is_active==True).order_by(Food_categories.sort_order))).all()
  assert [c.name for c in categories]==['UFO Бургеры','Пиццы','Закуски','Лимонады','Молочные коктейли','Горячие чаи','Напитки','Десерты / Летний бар']
  expected={'Мохито':(1300,1500),'Арбузный мохито':(1300,1500),'Киви-лайм':(1400,1700),'Манго-маракуйя':(1600,1800),'Ягодный':(1500,1700),'Матча':(1400,1700)}
  for item in products:
   links=(await db.scalars(select(Item_modifier_groups).where(Item_modifier_groups.food_item_id==item.id))).all()
   opts=[]
   for link in links:
    groupopts=(await db.scalars(select(Modifier_options).where(Modifier_options.group_id==link.modifier_group_id).order_by(Modifier_options.sort_order))).all()
    opts.append(groupopts)
   combinations=[[g[0] for g in opts]] if opts else [[]]
   if item.name in expected:
    assert [x.name for x in opts[0]]==['0,5 л','0,65 л']
    assert tuple(item.price+x.price for x in opts[0])==expected[item.name]
    combinations=[[x] for x in opts[0]]
   if item.name=='Гонконгские вафли':
    assert [[x.name for x in g] for g in opts]==[['клубничный','шоколадный','киви'],['орехи','кокосовая стружка','шоколадная посыпка','Oreo']]
    combinations=[[a,b] for a in opts[0] for b in opts[1]]
   if not item.available:
    assert item.price is None and [x.name for x in opts[0]]==['0,5 л','1 л']
   for combination in combinations:
    line={'id':item.id,'quantity':1,'modifiers':[{'option_id':o.id} for o in combination]}
    data={'restaurant_id':1,'customer_name':'Test','customer_phone':'+77000000000','delivery_method':'pickup','order_items':json.dumps([line])}
    if not item.available:
     with pytest.raises(HTTPException):await validate_food_order(db,data,staff_quote=True,catalog_only=True)
    else:
     _,validated,total=await validate_food_order(db,data,staff_quote=True,catalog_only=True)
     assert total==item.price+sum(o.price for o in combination)
     assert [x['option_id'] for x in validated[0]['modifiers']]==[o.id for o in combination]
  products[0].price=2345;await db.commit()
  assert (await seed_dam_alem_catalog(db))['already_applied']
  assert products[0].price==2345
 await engine.dispose()

@pytest.mark.asyncio
async def test_clean_database_bootstraps_restaurant_catalog_and_marketing(monkeypatch):
 engine=create_async_engine('sqlite+aiosqlite:///:memory:')
 async with engine.begin() as c:await c.run_sync(Base.metadata.create_all)
 maker=async_sessionmaker(engine,expire_on_commit=False)
 async with maker() as db:
  result=await seed_dam_alem_catalog(db)
  restaurant=await db.get(Food_restaurants,result['restaurant_id'])
  assert restaurant.name=='DAM ALEM 2.0'
  assert restaurant.merchant_key=='dam_alem'
  assert restaurant.min_order==2000
  assert len((await db.scalars(select(Food_items).where(Food_items.restaurant_id==restaurant.id))).all())==37
 from core.database import db_manager
 from services.dam_alem_marketing_seed import ensure_dam_alem_marketing
 monkeypatch.setattr(db_manager,'async_session_maker',maker)
 monkeypatch.delenv('DAM_ALEM_SEED_MARKETING',raising=False)
 await ensure_dam_alem_marketing()
 async with maker() as db:
  settings={row.setting_key:row.setting_value for row in (await db.scalars(select(Food_settings))).all()}
  assert settings['min_order_amount']=='2000'
  assert settings['delivery_price']=='500'
  assert settings['service_fee_rate']=='10'
  active_banners=(await db.scalars(select(Banners).where(Banners.banner_type=='food_delivery',Banners.active.is_(True)))).all()
  assert {banner.title for banner in active_banners}=={'Орбита Чикен','Орбита Биф'}
 await engine.dispose()
