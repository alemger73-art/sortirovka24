"""Provider-independent WhatsApp tool contract. NO HTTP endpoint or live channel.

Only an authenticated provider adapter may construct a VerifiedSender and confirm
an inbound customer's reply. LLM arguments contain neither identity nor tenant.
"""
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
import hashlib
import json
import secrets
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from models.crm import Business, Customer, ChannelConfirmation
from models.food_restaurants import Food_restaurants
from models.food_items import Food_items
from models.food_orders import Food_orders
from services import crm, loyalty as L
from services.food_order_validation import validate_food_order
from services.food_preorders import schedule_settings, available_slots

@dataclass(frozen=True)
class VerifiedSender:
    business_id:str
    customer_id:str
    # This value is supplied only by the future signature-validating adapter.
    provider_account:str

async def resolve_sender(db, *, business_id, phone, provider_account, signature_verified=False):
    if not signature_verified or not provider_account:
        raise HTTPException(401,'Требуется проверенный контекст провайдера')
    business=await db.get(Business,business_id)
    if not business or not business.active:raise HTTPException(404,'Бизнес не подключён')
    customer=await crm.resolve(db,phone,'',business_id=business_id,source='whatsapp')
    return VerifiedSender(business_id,customer.id,provider_account)

class Empty(BaseModel):
    model_config=ConfigDict(extra='forbid')

class Draft(BaseModel):
    model_config=ConfigDict(extra='forbid')
    restaurant_id:int
    items:list[dict]=Field(min_length=1,max_length=100)
    customer_name:str=Field(min_length=1,max_length=150)
    delivery_method:str
    delivery_address:str=Field('',max_length=500)
    delivery_lat:float|None=Field(None,ge=-90,le=90,allow_inf_nan=False)
    delivery_lng:float|None=Field(None,ge=-180,le=180,allow_inf_nan=False)
    payment_method:str
    cash_given_amount:Decimal|None=Field(None,ge=0,le=100000000,allow_inf_nan=False)
    scheduled_for:str|None=None
    comment:str=Field('',max_length=1000)
    promo_code:str|None=Field(None,max_length=100)
    selected_gift_id:str|None=None
    bonus_points_to_use:Decimal=Field(Decimal('0'),ge=0,le=100000000,allow_inf_nan=False)

class Confirmation(Empty):
    confirmation_id:str=Field(min_length=20,max_length=64)

def fingerprint(data):
    # Exclude volatile server time; retain every priced, scheduled and customer
    # visible field. A changed price/rule/location requires a fresh confirmation.
    keys=('order_items','total_amount','delivery_method','delivery_address','scheduled_for',
          'payment_method','cash_given_amount','change_amount','comment','loyalty_snapshot','pickup_snapshot')
    return hashlib.sha256(json.dumps({k:data.get(k) for k in keys},sort_keys=True,default=str,ensure_ascii=False).encode()).hexdigest()

async def calculate(db,ctx,draft):
    c=await crm.scoped_customer(db,ctx.business_id,ctx.customer_id)
    rest=await db.get(Food_restaurants,draft.restaurant_id)
    if not rest or await crm.business_for_restaurant(db,rest)!=ctx.business_id:
        raise HTTPException(404,'Заведение не найдено в этом бизнесе')
    payload=draft.model_dump(exclude={'items','bonus_points_to_use'},mode='json')
    payload.update(customer_phone=c.normalized_phone,order_items=json.dumps(draft.items),total_amount=0)
    data,_,_=await validate_food_order(db,payload,account_user=c,bonus_points_to_use=draft.bonus_points_to_use,server_pricing=True)
    data['order_source']='whatsapp'
    return data

async def confirmation(db,ctx,cid):
    row=await db.get(ChannelConfirmation,cid)
    if not row or row.business_id!=ctx.business_id or row.customer_id!=ctx.customer_id:
        raise HTTPException(404,'Подтверждение не найдено')
    if not row.order_id and L.aware(row.expires_at)<=L.now():raise HTTPException(409,'Расчёт истёк. Пересчитайте заказ')
    return row

async def confirm_customer_reply(db,ctx,cid,*,explicit_confirmation=False):
    """Not an AI tool. Future adapter calls this for the customer's own reply."""
    if not explicit_confirmation:raise HTTPException(409,'Нужно явное подтверждение клиента')
    await L.policy(db,lock=True,business_id=ctx.business_id)
    row=await confirmation(db,ctx,cid)
    if not row.confirmed_at:
        row.confirmed_at=L.now()
        L.audit(db,'channel_quote_confirmed',{'id':ctx.customer_id,'role':'customer'},'channel_confirmation',cid,{'business':ctx.business_id})
    await db.flush()

async def tool(db,ctx,name,args,*,message_id=None):
    from utils.rate_limit import check_keyed_rate_limit
    check_keyed_rate_limit('channel:'+ctx.business_id+':'+ctx.customer_id,max_hits=120,window_seconds=3600)
    customer=await crm.scoped_customer(db,ctx.business_id,ctx.customer_id)
    # Reject context-changing / administrative fields even for read-only tools.
    if name not in {'customer','bonus_balance','menu','slots','quote','create_order'}:
        raise HTTPException(403,'Инструмент не разрешён')
    if name in {'customer','bonus_balance','menu','slots'}:Empty.model_validate(args)
    if name=='customer':return await crm.overview(db,ctx.business_id,customer.id,include_internal=False)
    if name=='bonus_balance':return await L.summary(db,customer.id,business_id=ctx.business_id)
    if name=='slots':
        if ctx.business_id!=crm.DAM:raise HTTPException(409,'Расписание этого бизнеса ещё не подключено')
        return available_slots(await schedule_settings(db))
    if name=='menu':
        from services.menu_configuration import catalog
        current = await catalog(db, business_id=ctx.business_id)
        return [p for p in current['products'] if p['sellable']]
    await L.policy(db,lock=True,business_id=ctx.business_id)
    if name=='quote':
        draft=Draft.model_validate(args)
        if not message_id:raise HTTPException(422,'Нужен идентификатор входящего сообщения')
        message_key=hashlib.sha256((ctx.provider_account+':'+ctx.business_id+':'+ctx.customer_id+':'+message_id).encode()).hexdigest()
        old=await db.scalar(select(ChannelConfirmation).where(ChannelConfirmation.message_key==message_key))
        payload=draft.model_dump(mode='json')
        if old:
            if old.payload['draft']!=payload:raise HTTPException(409,'Повтор сообщения с другим содержимым')
            return {'confirmation_id':old.id,**old.payload['quote']}
        data=await calculate(db,ctx,draft)
        view={k:data.get(k) for k in ('total_amount','order_items','payment_method','cash_given_amount','change_amount','delivery_method','scheduled_for','comment','pickup_snapshot')}
        row=ChannelConfirmation(id=secrets.token_urlsafe(24),business_id=ctx.business_id,customer_id=ctx.customer_id,
            message_key=message_key,quote_hash=fingerprint(data),payload={'draft':payload,'quote':view},expires_at=L.now()+timedelta(minutes=10))
        db.add(row);await db.flush()
        return {'confirmation_id':row.id,**view}
    request=Confirmation.model_validate(args)
    row=await confirmation(db,ctx,request.confirmation_id)
    if row.order_id:
        order=await db.get(Food_orders,row.order_id)
        return crm.order_view(order)
    if not row.confirmed_at:raise HTTPException(409,'Клиент ещё не подтвердил заказ')
    data=await calculate(db,ctx,Draft.model_validate(row.payload['draft']))
    if fingerprint(data)!=row.quote_hash:raise HTTPException(409,'Цена или условия изменились. Нужен новый расчёт и подтверждение')
    from services.food_orders import Food_ordersService
    order=await Food_ordersService(db).create(data,request_key='whatsapp:'+row.id,request_hash=row.quote_hash,actor='WhatsApp: подтверждено клиентом',channel_confirmation=row)
    return crm.order_view(order)
