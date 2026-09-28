"""Future channel boundary, using the real order/pricing DB and no provider."""
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, func
from models.crm import Business, CustomerNote, BusinessCustomer
from models.food_orders import Food_orders
from models.food_items import Food_items
from services import crm, business_channel as C
from tests.test_dam_order_workflow import env

DRAFT=dict(restaurant_id=1,items=[{'id':2,'quantity':2}],customer_name='Channel customer',delivery_method='pickup',payment_method='cash',comment='Без льда')

async def sender(db, phone='+77003334455'):
    return await C.resolve_sender(db,business_id=crm.DAM,phone=phone,provider_account='test-provider',signature_verified=True)

@pytest.mark.asyncio
async def test_quote_confirm_create_retry_one_customer_one_order(env):
    _,maker,_,_=env
    async with maker() as db:
        ctx=await sender(db)
        quote=await C.tool(db,ctx,'quote',DRAFT,message_id='message1')
        assert quote['total_amount']==600
        repeat=await C.tool(db,ctx,'quote',DRAFT,message_id='message1')
        assert repeat['confirmation_id']==quote['confirmation_id']
        args={'confirmation_id':quote['confirmation_id']}
        with pytest.raises(HTTPException) as ex:await C.tool(db,ctx,'create_order',args)
        assert ex.value.status_code==409
        await C.confirm_customer_reply(db,ctx,quote['confirmation_id'],explicit_confirmation=True)
        first=await C.tool(db,ctx,'create_order',args)
        retry=await C.tool(db,ctx,'create_order',args)
        assert first['id']==retry['id']
        row=await db.get(Food_orders,first['id'])
        assert row.order_source=='whatsapp' and row.delivery_method=='pickup'
        assert row.customer_id==ctx.customer_id and row.business_id==crm.DAM
        assert row.payment_status=='pending' and row.status=='new'
        assert row.comment=='Без льда'
        assert await db.scalar(select(func.count()).select_from(Food_orders).where(Food_orders.customer_id==ctx.customer_id))==1

@pytest.mark.asyncio
async def test_channel_cannot_choose_identity_or_owner_actions_or_leak_notes(env):
    _,maker,_,_=env
    async with maker() as db:
        ctx=await sender(db)
        member=await db.scalar(select(BusinessCustomer).where(BusinessCustomer.customer_id==ctx.customer_id))
        db.add(CustomerNote(membership_id=member.id,text='INTERNAL ONLY',author='2',actor_role='owner'))
        await db.flush()
        view=await C.tool(db,ctx,'customer',{})
        assert 'notes' not in view and 'INTERNAL ONLY' not in str(view)
        for tool in ('earn','adjust','sql','set_payment','confirm_customer_reply'):
            with pytest.raises(HTTPException) as ex:await C.tool(db,ctx,tool,{})
            assert ex.value.status_code==403
        with pytest.raises(ValidationError):await C.tool(db,ctx,'customer',{'customer_id':'foreign'})
        with pytest.raises(ValidationError):await C.tool(db,ctx,'quote',{**DRAFT,'business_id':'foreign'},message_id='x')
        with pytest.raises(HTTPException):await C.resolve_sender(db,business_id=crm.DAM,phone='+77003334455',provider_account='x')

@pytest.mark.asyncio
async def test_confirmation_price_change_and_foreign_customer_are_rejected(env):
    _,maker,_,_=env
    async with maker() as db:
        ctx=await sender(db)
        q=await C.tool(db,ctx,'quote',DRAFT,message_id='price')
        await C.confirm_customer_reply(db,ctx,q['confirmation_id'],explicit_confirmation=True)
        other=await sender(db,'+77006667788')
        with pytest.raises(HTTPException) as ex:await C.tool(db,other,'create_order',{'confirmation_id':q['confirmation_id']})
        assert ex.value.status_code==404
        item=await db.get(Food_items,2);item.price=350;await db.flush()
        with pytest.raises(HTTPException) as ex:await C.tool(db,ctx,'create_order',{'confirmation_id':q['confirmation_id']})
        assert ex.value.status_code==409
        assert await db.scalar(select(func.count()).select_from(Food_orders).where(Food_orders.customer_id==ctx.customer_id))==0
