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

@pytest.mark.parametrize('flag',[False,0,'false','off','no'])
def test_disabled_code_rejected(flag):
 with pytest.raises(HTTPException):_resolve_promo('OFF',10000,{'promo_codes':json.dumps([{'code':'OFF','active':flag,'value':50}])})

def test_expired_code_rejected_and_fraction_matches_browser():
 with pytest.raises(HTTPException):_resolve_promo('OLD',10000,{'promo_codes':json.dumps([{'code':'OLD','value':10,'valid_until':'2020-01-01'}])})
 assert _resolve_promo('ROUND',2505,{'promo_codes':json.dumps([{'code':'ROUND','value':10}])})==(251,False)
