import json
import pytest
from fastapi import HTTPException
from starlette.requests import Request
from services.food_order_validation import _resolve_promo
from services.dam_alem_marketing_defaults import PROMO_CODES
from routers.food_store import validate_promo, PromoValidateRequest

@pytest.mark.asyncio
@pytest.mark.parametrize('promo',PROMO_CODES)
async def test_preview_matches_checkout_at_threshold_and_cap(monkeypatch,promo):
 settings={'promo_codes':json.dumps([promo])}
 async def config(self):return settings
 monkeypatch.setattr('routers.food_store.Food_settingsService.get_all_as_dict',config)
 monkeypatch.setattr('routers.food_store.check_ip_rate_limit',lambda *a,**k:None)
 request=Request({'type':'http','headers':[],'client':('127.0.0.1',1)})
 for amount in [promo['min_order'],50000,2505]:
  if amount<promo['min_order']:
   with pytest.raises(HTTPException):_resolve_promo(promo['code'],amount,settings)
   with pytest.raises(HTTPException):await validate_promo(PromoValidateRequest(code=promo['code'],cart_subtotal=amount),request,None)
  else:
   preview=await validate_promo(PromoValidateRequest(code=promo['code'].lower(),cart_subtotal=amount),request,None)
   assert (preview['discount'],preview['free_delivery'])==_resolve_promo(promo['code'],amount,settings)
   assert 0<=preview['discount']<=amount
   if promo.get('max_discount'):assert preview['discount']<=promo['max_discount']

@pytest.mark.parametrize('raw',['[]','', 'broken'])
def test_empty_promo_list_does_not_restore_old_discounts(raw):
 with pytest.raises(HTTPException):_resolve_promo('DAMALEM10',10000,{'promo_codes':raw})


def test_dessert_threshold_choice_and_stop_list():
 from types import SimpleNamespace
 from services.dam_alem_marketing_defaults import LOYALTY_GIFTS
 from services.food_order_validation import _resolve_selected_gift, available_gifts
 settings={'loyalty_gifts':json.dumps(LOYALTY_GIFTS)}
 assert _resolve_selected_gift('',10999,settings) is None
 with pytest.raises(HTTPException):_resolve_selected_gift('',11000,settings)
 for gift in LOYALTY_GIFTS:
  assert _resolve_selected_gift(gift['id'],11000,settings)['id']==gift['id']
 products=[SimpleNamespace(id=i+1,name=g['product_name'],restaurant_id=1,is_active=True,available=i==0) for i,g in enumerate(LOYALTY_GIFTS)]
 choices=available_gifts(settings,products,1)
 assert len(choices)==1 and choices[0]['product_id']==1
 assert _resolve_selected_gift('',12000,{'loyalty_gifts':'[]'}) is None

@pytest.mark.parametrize('flag',[False,0,'false','off','no'])
def test_disabled_code_rejected(flag):
 with pytest.raises(HTTPException):_resolve_promo('OFF',10000,{'promo_codes':json.dumps([{'code':'OFF','active':flag,'value':50}])})

def test_expired_code_rejected_and_fraction_matches_browser():
 with pytest.raises(HTTPException):_resolve_promo('OLD',10000,{'promo_codes':json.dumps([{'code':'OLD','value':10,'valid_until':'2020-01-01'}])})
 assert _resolve_promo('ROUND',2505,{'promo_codes':json.dumps([{'code':'ROUND','value':10}])})==(251,False)

@pytest.mark.asyncio
@pytest.mark.parametrize('raw',['[]',json.dumps([dict(p,active=False,value=3) for p in PROMO_CODES])])
async def test_restart_preserves_owner_promo_configuration(monkeypatch,raw):
 from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
 from sqlalchemy import select
 from core.database import db_manager
 from models.food_settings import Food_settings
 from services.dam_alem_marketing_seed import ensure_dam_alem_marketing
 engine=create_async_engine('sqlite+aiosqlite:///:memory:')
 from core.database import Base
 from models.food_restaurants import Food_restaurants
 from models.food_items import Food_items
 async with engine.begin() as c:await c.run_sync(lambda conn: Base.metadata.create_all(conn, tables=[Food_settings.__table__, Food_restaurants.__table__, Food_items.__table__]))
 maker=async_sessionmaker(engine,expire_on_commit=False)
 async with maker() as db:
  db.add(Food_settings(setting_key='promo_codes',setting_value=raw,is_active=True));await db.commit()
 async def noop(db):return 0
 monkeypatch.delenv('DAM_ALEM_SEED_MARKETING',raising=False)
 monkeypatch.setattr(db_manager,'async_session_maker',maker)
 monkeypatch.setattr('services.dam_alem_marketing_seed._refresh_food_banner_images',noop)
 monkeypatch.setattr('services.dam_alem_marketing_seed._ensure_food_banners',noop)
 await ensure_dam_alem_marketing()
 async with maker() as db:
  row=await db.scalar(select(Food_settings).where(Food_settings.setting_key=='promo_codes'))
  assert row.setting_value==raw
 await engine.dispose()
