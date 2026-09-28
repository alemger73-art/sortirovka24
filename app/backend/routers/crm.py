"""Business context comes from authenticated membership, never request payload."""
from fastapi import APIRouter, Depends, Query, HTTPException, Header
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select, func
from core.database import get_db
from core.food_staff_guard import food_staff, food_owner
from services import crm, loyalty
from models.crm import CustomerNote, BusinessCustomer, Customer, Business
from models.food_orders import Food_orders
from models.loyalty import BonusMember
from services.account_session import resolve_account_user
from utils.rate_limit import check_keyed_rate_limit
router=APIRouter(prefix='/api/v1/crm',tags=['crm'])

async def context(business_id:str,claims=Depends(food_staff)):
    # Existing partner credentials authorize DAM only. New businesses require
    # an explicit membership implementation; URL/JSON never grants it.
    if business_id!=crm.DAM:
        raise HTTPException(403,'Нет доступа к CRM этого бизнеса')
    return {'business_id':crm.DAM,'actor':{'id':str(claims.get('staff_id') or claims.get('sub')),'role':claims['access_role']}}

class NewCustomer(BaseModel):
    model_config=ConfigDict(extra='forbid')
    phone:str=Field(min_length=7,max_length=32)
    name:str=Field(min_length=1,max_length=150)
class NewNote(BaseModel):
    model_config=ConfigDict(extra='forbid')
    text:str=Field(min_length=3,max_length=1500)

@router.get('/businesses/{business_id}/customers')
async def search(business_id:str,q:str=Query('',max_length=80),db=Depends(get_db),ctx=Depends(context)):
    return await crm.search(db,ctx['business_id'],q)

@router.post('/businesses/{business_id}/customers')
async def create(business_id:str,body:NewCustomer,db=Depends(get_db),ctx=Depends(context)):
    check_keyed_rate_limit('crm:create:'+ctx['actor']['id'],max_hits=120,window_seconds=3600)
    c=await crm.resolve(db,body.phone,body.name,business_id=ctx['business_id'],actor=ctx['actor'])
    await loyalty.account(db,c.id,business_id=ctx['business_id'])
    await db.commit()
    return {'id':c.id,'name':c.name,'phone':c.normalized_phone}

@router.get('/businesses/{business_id}/customers/{customer_id}')
async def overview(business_id:str,customer_id:str,db=Depends(get_db),ctx=Depends(context)):
    result=await crm.overview(db,ctx['business_id'],customer_id,include_internal=True)
    await db.commit()
    return result

@router.get('/businesses/{business_id}/customers/{customer_id}/orders')
async def history(business_id:str,customer_id:str,offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100),db=Depends(get_db),ctx=Depends(context)):
    await crm.scoped_customer(db,ctx['business_id'],customer_id)
    rows=(await db.scalars(select(Food_orders).where(Food_orders.business_id==ctx['business_id'],Food_orders.customer_id==customer_id).order_by(Food_orders.id.desc()).offset(offset).limit(limit))).all()
    return [crm.order_view(x) for x in rows]

@router.post('/businesses/{business_id}/customers/{customer_id}/notes')
async def note(business_id:str,customer_id:str,body:NewNote,db=Depends(get_db),ctx=Depends(context)):
    c=await crm.scoped_customer(db,ctx['business_id'],customer_id)
    m=await crm.membership(db,c,ctx['business_id'])
    row=CustomerNote(membership_id=m.id,text=body.text.strip(),author=ctx['actor']['id'],actor_role=ctx['actor']['role'])
    db.add(row);await db.flush()
    crm.audit(db,'crm_note_created',ctx['actor'],c,ctx['business_id'],note_id=row.id,text=row.text)
    await db.commit()
    return {'id':row.id}

@router.get('/me/businesses')
async def mine(authorization:str|None=Header(None),db=Depends(get_db)):
    u=await resolve_account_user(db,authorization)
    if not u: raise HTTPException(401,'Войдите в аккаунт')
    c=await crm.for_account(db,u)
    rows=(await db.execute(select(BusinessCustomer,Business).join(Business,Business.id==BusinessCustomer.business_id).where(BusinessCustomer.customer_id==c.id))).all()
    result=[]
    for member,business in rows:
        state=await loyalty.summary(db,c.id,business_id=business.id)
        result.append({'business_id':business.id,'name':business.name,'loyalty':state})
    await db.commit()
    return result

@router.get('/me/businesses/{business_id}')
async def my_business(business_id:str,authorization:str|None=Header(None),db=Depends(get_db)):
    u=await resolve_account_user(db,authorization)
    if not u: raise HTTPException(401,'Войдите в аккаунт')
    c=await crm.for_account(db,u)
    result=await crm.overview(db,business_id,c.id,include_internal=False)
    await db.commit()
    return result

@router.get('/businesses/{business_id}/directory')
async def directory(business_id:str,q:str=Query('',max_length=80),offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=50),db=Depends(get_db),ctx=Depends(context),owner=Depends(food_owner)):
    from sqlalchemy import or_
    query=select(Customer,BusinessCustomer,BonusMember.bonus_balance).join(BusinessCustomer,BusinessCustomer.customer_id==Customer.id).outerjoin(BonusMember,BonusMember.id==BusinessCustomer.id).where(BusinessCustomer.business_id==ctx['business_id'])
    text=q.strip().replace('%','').replace('_','')
    if text: query=query.where(or_(Customer.name.ilike('%'+text+'%'),Customer.normalized_phone.ilike('%'+text+'%')))
    total=await db.scalar(select(func.count()).select_from(query.subquery()))
    rows=(await db.execute(query.order_by(BusinessCustomer.first_seen_at.desc(),Customer.id).offset(offset).limit(limit))).all()
    result=[]
    for c,m,balance in rows:
        result.append({'id':c.id,'name':c.name,'phone':c.normalized_phone,'state':c.state,'first_source':m.first_source,
            'registered':bool(c.user_id),'balance':balance or 0,'created_at':m.first_seen_at})
    return {'total':total,'items':result}

class Consent(BaseModel):
    model_config=ConfigDict(extra='forbid')
    marketing_opt_in:bool

@router.patch('/me/businesses/{business_id}/consent')
async def consent(business_id:str,body:Consent,authorization:str|None=Header(None),db=Depends(get_db)):
    u=await resolve_account_user(db,authorization)
    if not u: raise HTTPException(401,'Войдите в аккаунт')
    c=await crm.for_account(db,u)
    await crm.scoped_customer(db,business_id,c.id)
    m=await crm.membership(db,c,business_id)
    old=m.marketing_opt_in;m.marketing_opt_in=body.marketing_opt_in
    crm.audit(db,'marketing_consent_changed',{'id':u.id,'role':'customer'},c,business_id,old=old,new=m.marketing_opt_in)
    await db.commit()
    return {'marketing_opt_in':m.marketing_opt_in}


class Enrollment(BaseModel):
    model_config=ConfigDict(extra='forbid')
    enabled:bool
    reason:str=Field(min_length=3,max_length=500)

@router.patch('/businesses/{business_id}/customers/{customer_id}/loyalty')
async def enrollment(business_id:str,customer_id:str,body:Enrollment,db=Depends(get_db),ctx=Depends(context),owner=Depends(food_owner)):
    c=await crm.scoped_customer(db,ctx['business_id'],customer_id)
    await loyalty.policy(db,lock=True,business_id=ctx['business_id'])
    m=await loyalty.account(db,c.id,business_id=ctx['business_id'])
    old=bool(m.enabled);m.enabled=body.enabled
    crm.audit(db,'loyalty_enrollment_changed',ctx['actor'],c,ctx['business_id'],old=old,new=body.enabled,reason=body.reason.strip())
    await db.commit()
    return {'enabled':body.enabled}


@router.get('/businesses/{business_id}/customers/{customer_id}/timeline')
async def customer_timeline(business_id:str,customer_id:str,offset:int=Query(0,ge=0,le=10000),limit:int=Query(20,ge=1,le=50),db=Depends(get_db),ctx=Depends(context)):
    from services.crm_timeline import history
    return await history(db,ctx['business_id'],customer_id,offset,limit)
