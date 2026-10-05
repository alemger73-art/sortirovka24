"""Shared CRM. No commits; caller owns the order/identity transaction."""
import re
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, or_, func
from models.crm import Business, Customer, CustomerIdentity, BusinessCustomer, BusinessLocation, CustomerNote
from models.auth import User
from models.food_orders import Food_orders
from models.food_restaurants import Food_restaurants
DAM = 'dam_alem'


def normalize_phone(value):
    digits = re.sub(r'[^0-9]', '', str(value or ''))
    if len(digits) == 10: digits = '7'+digits
    if len(digits) == 11 and digits[0] == '8': digits = '7'+digits[1:]
    if len(digits) != 11 or digits[0] != '7':
        raise HTTPException(422, 'Укажите телефон +7 и десять цифр')
    return '+'+digits


async def lock(db):
    # Same lock order as checkout/payment/loyalty; SQLite serializes INSERTs.
    from services.food_preorders import lock_dam_operations
    await lock_dam_operations(db)


async def ensure_business(db, business_id=DAM, name=None):
    if db.bind.dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    await db.execute(insert(Business).values(id=business_id, name=name or ('DÄM ALEM 2.0' if business_id==DAM else business_id), slug=business_id, active=True).on_conflict_do_nothing(index_elements=['id']))
    return await db.get(Business, business_id)


async def business_for_restaurant(db, restaurant):
    from services.food_operations import brand
    business_id = restaurant.business_id
    if not business_id:
        business_id = DAM if brand(restaurant.name, restaurant.merchant_key) else f'restaurant-{restaurant.id}'
        restaurant.business_id = business_id
    await ensure_business(db, business_id, restaurant.name)
    return business_id


def audit(db, action, actor, customer, business_id, **details):
    from services.loyalty import audit as record
    record(db, action, actor, 'customers', customer.id, {'business_id':business_id, **details})


async def resolve(db, phone, name='', *, actor=None, business_id=None, source='operator'):
    phone = normalize_phone(phone)
    await lock(db)
    # UPSERT is the concurrency boundary even before any customer exists.
    if db.bind.dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    import uuid
    candidate = str(uuid.uuid4())
    alias = await db.get(CustomerIdentity, phone)
    if alias:
        customer = await db.get(Customer, alias.customer_id)
    else:
        await db.execute(insert(Customer).values(id=candidate, normalized_phone=phone, name=(name or 'Клиент').strip()[:255], state='NORMAL').on_conflict_do_nothing(index_elements=['normalized_phone']))
        customer = await db.scalar(select(Customer).where(Customer.normalized_phone==phone))
        await db.execute(insert(CustomerIdentity).values(normalized_phone=phone,customer_id=customer.id).on_conflict_do_nothing(index_elements=['normalized_phone']))
        if customer.id == candidate:
            audit(db,'customer_created',actor,customer,business_id,source=source)
    if business_id:
        await membership(db, customer, business_id, source=source, actor=actor)
    return customer


async def membership(db, customer, business_id=DAM, *, source='app', actor=None):
    await ensure_business(db,business_id)
    if db.bind.dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    import uuid
    candidate=str(uuid.uuid4())
    await db.execute(insert(BusinessCustomer).values(id=candidate,business_id=business_id,customer_id=customer.id,first_source=source,marketing_opt_in=False,transactional_enabled=True).on_conflict_do_nothing(index_elements=['business_id','customer_id']))
    row=await db.scalar(select(BusinessCustomer).where(BusinessCustomer.business_id==business_id,BusinessCustomer.customer_id==customer.id))
    if row.id==candidate:
        audit(db,'business_customer_created',actor,customer,business_id,source=source)
    return row


async def for_account(db, user, *, business_id=None, require_verified=True):
    existing=await db.scalar(select(Customer).where(Customer.user_id==str(user.id)))
    if existing:
        if existing.state != 'NORMAL':
            raise HTTPException(409, 'Связь клиента требует проверки поддержки')
        if normalize_phone(user.phone) != existing.normalized_phone:
            raise HTTPException(409, 'Изменённый телефон требует подтверждения и проверки связи клиента')
        if require_verified and not user.phone_verified_at:
            raise HTTPException(409,'Подтвердите телефон, чтобы использовать CRM и бонусы')
        if user.phone_verified_at and not existing.verified_at:
            existing.verified_at = user.phone_verified_at
            alias = await db.get(CustomerIdentity, existing.normalized_phone)
            if alias: alias.verified_at = user.phone_verified_at
            audit(db, 'account_link_verified', {'id':user.id,'role':'customer'}, existing, business_id, verified_phone=True)
        if business_id: await membership(db,existing,business_id)
        return existing
    if not user.phone_verified_at:
        raise HTTPException(409,'Для привязки прежних заказов подтвердите телефон')
    customer=await resolve(db,user.phone,user.name or '',business_id=business_id,source='app')
    if customer.user_id and customer.user_id!=str(user.id):
        raise HTTPException(409,'Номер связан с другим аккаунтом; требуется проверка поддержки')
    if customer.state!='NORMAL':
        raise HTTPException(409,'Связь клиента требует проверки поддержки')
    customer.user_id=str(user.id)
    customer.verified_at=user.phone_verified_at
    alias=await db.get(CustomerIdentity,normalize_phone(user.phone))
    alias.verified_at=user.phone_verified_at
    audit(db,'account_linked',{'id':user.id,'role':'customer'},customer,business_id,verified_phone=True)
    await db.flush()
    return customer


async def scoped_customer(db, business_id, customer_id):
    row=await db.scalar(select(Customer).join(BusinessCustomer,BusinessCustomer.customer_id==Customer.id).where(Customer.id==customer_id,BusinessCustomer.business_id==business_id))
    if not row: raise HTTPException(404,'Клиент не найден в этом бизнесе')
    return row


async def attach_order(db, order, account_user=None):
    rest=await db.get(Food_restaurants,order.restaurant_id)
    if not rest: raise HTTPException(404,'Заведение не найдено')
    business_id=await business_for_restaurant(db,rest)
    order.business_id=business_id
    if order.delivery_method=='dine_in' and not (order.customer_phone or '').strip():
        order.customer_id=None
        return None
    customer=await resolve(db,order.customer_phone,order.customer_name or '',business_id=business_id,source=order.order_source or 'app')
    # Caller never supplies customer_id/business_id authority.
    if account_user and account_user.phone_verified_at and normalize_phone(account_user.phone)==customer.normalized_phone:
        linked=await for_account(db,account_user,business_id=business_id)
        if linked.id!=customer.id: raise HTTPException(409,'Контакт заказа изменился')
    order.business_id,order.customer_id=business_id,customer.id
    await db.flush()
    return customer


def search_criterion(query):
    """One normalized phone/name predicate for operator and owner searches."""
    text = query.strip()[:80]
    if re.fullmatch(r'[0-9\s()+.\-]+', text):
        digits = re.sub(r'[^0-9]', '', text)
        if len(digits) in (10, 11):
            try:
                return Customer.normalized_phone == normalize_phone(text)
            except HTTPException:
                # An invalid complete number must not match a different client.
                return Customer.normalized_phone == ''
        if digits.startswith('8'):
            digits = '7' + digits[1:]
        return Customer.normalized_phone.like('+' + digits + '%')
    text = text.replace('%', '').replace('_', '').replace('\\', '')
    return Customer.name.ilike('%' + text + '%')


async def search(db,business_id,query,limit=10):
    text=query.strip()[:80]
    if len(text)<3: return []
    digits=re.sub(r'[^0-9]','',text)
    if digits.startswith('8') and len(digits)>=3: digits='7'+digits[1:]
    criterion=Customer.normalized_phone.like('+'+digits+'%') if len(digits)>=3 else func.lower(Customer.name).like('%'+text.lower().replace('%','').replace('_','')+'%')
    rows=(await db.scalars(select(Customer).join(BusinessCustomer,BusinessCustomer.customer_id==Customer.id).where(BusinessCustomer.business_id==business_id,criterion).order_by(Customer.name).limit(limit))).all()
    return [{'id':x.id,'name':x.name,'phone':x.normalized_phone} for x in rows]


async def overview(db,business_id,customer_id,*,include_internal=False):
    c=await scoped_customer(db,business_id,customer_id)
    scope=(Food_orders.customer_id==c.id,Food_orders.business_id==business_id)
    stats=(await db.execute(select(func.count(Food_orders.id),func.coalesce(func.sum(Food_orders.paid_amount),0),func.avg(Food_orders.total_amount)).where(*scope,Food_orders.status=='done',Food_orders.payment_status=='paid'))).one()
    recent=(await db.scalars(select(Food_orders).where(*scope).order_by(Food_orders.id.desc()).limit(10))).all()
    addresses=(await db.scalars(select(Food_orders.delivery_address).where(*scope,Food_orders.delivery_method=='delivery',Food_orders.delivery_address.is_not(None)).distinct().limit(20))).all()
    upcoming=(await db.scalars(select(Food_orders).where(*scope,Food_orders.scheduled_for>datetime.now(timezone.utc).isoformat(),Food_orders.status.notin_(['done','cancelled'])).order_by(Food_orders.scheduled_for).limit(10))).all()
    from services import loyalty
    result={'id':c.id,'name':c.name,'phone':c.normalized_phone,'business_id':business_id,'orders_count':stats[0],'paid_total':stats[1],'average_check':stats[2] or 0,
        'last_order':recent[0].created_at if recent else None,'last_fulfillment':recent[0].delivery_method if recent else None,
        'addresses':addresses,'upcoming':[order_view(x) for x in upcoming], 'recent':[order_view(x) for x in recent],
        'loyalty':await loyalty.summary(db,c.id,business_id=business_id)}
    member=await db.scalar(select(BusinessCustomer).where(BusinessCustomer.customer_id==c.id,BusinessCustomer.business_id==business_id))
    result['marketing_opt_in']=member.marketing_opt_in
    if include_internal:
        notes=(await db.scalars(select(CustomerNote).where(CustomerNote.membership_id==member.id).order_by(CustomerNote.id.desc()).limit(30))).all()
        result['notes']=[{'id':x.id,'text':x.text,'author':x.author,'created_at':x.created_at} for x in notes]
    return result


def order_view(x):
    return {k:getattr(x,k) for k in ('id','created_at','scheduled_for','delivery_method','status','payment_status','total_amount','paid_amount','order_source','comment','pickup_snapshot')}


async def owns_order(db, user, order):
    if order.customer_id:
        c = await db.get(Customer, order.customer_id)
        return bool(c and c.user_id == str(user.id) and c.verified_at and user.phone_verified_at)
    from services.cabinet_history import owns_content
    return owns_content(user, order.user_id, order.customer_phone)


async def pickup_location(db, business_id=DAM):
    row = await db.scalar(select(BusinessLocation).where(BusinessLocation.business_id==business_id, BusinessLocation.active.is_(True)).order_by(BusinessLocation.id))
    if not row:
        # A bounded read fallback is needed during local fixtures / an unfinished
        # migration. No schema repair or guessed coordinates.
        if business_id != DAM: return None
        from services.food_preorders import pickup_view, schedule_settings
        return {**pickup_view(await schedule_settings(db)), 'id': 'dam_alem-main', 'supports_pickup':True, 'supports_delivery':True}
    return {'id':row.id, 'display_name':row.name, 'address':row.address, 'instructions':row.landmark,
        'photo':row.photo or '', 'latitude':row.latitude, 'longitude':row.longitude,
        'supports_pickup':row.supports_pickup, 'supports_delivery':row.supports_delivery}
