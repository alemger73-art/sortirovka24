"""A paginated view of existing business records; never a second event store."""
from sqlalchemy import select, literal, cast, String, func, union_all, or_, and_
from models.crm import BusinessCustomer, CustomerNote
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.user_management import Bonus, UserAction
from models.user_notifications import UserNotification
from services import crm

async def history(db, business_id, customer_id, offset=0, limit=20):
    await crm.scoped_customer(db,business_id,customer_id)
    member=await db.scalar(select(BusinessCustomer).where(BusinessCustomer.business_id==business_id,BusinessCustomer.customer_id==customer_id))
    scope=(Food_orders.business_id==business_id,Food_orders.customer_id==customer_id)
    order_ids=select(cast(Food_orders.id,String)).where(*scope)
    def row(kind,id,at,title,order=None):
        return select(literal(kind).label('kind'),cast(id,String).label('id'),func.replace(cast(at,String),' ','T').label('at'),title.label('title'),cast(order,String).label('order_id') if order is not None else literal(None,String).label('order_id'))
    queries=[
        row('customer',BusinessCustomer.id,BusinessCustomer.first_seen_at,literal('Клиент появился в этом бизнесе')).where(BusinessCustomer.id==member.id),
        row('order',Food_orders.id,Food_orders.created_at,literal('Заказ создан'),Food_orders.id).where(*scope),
        row('order_event',FoodOrderEvent.id,FoodOrderEvent.created_at,FoodOrderEvent.message,FoodOrderEvent.order_id).join(Food_orders,Food_orders.id==FoodOrderEvent.order_id).where(*scope),
        row('bonus',Bonus.id,Bonus.created_at,func.coalesce(Bonus.reason,Bonus.kind),Bonus.order_id).where(Bonus.business_id==business_id,Bonus.customer_id==customer_id),
        row('note',CustomerNote.id,CustomerNote.created_at,CustomerNote.text).where(CustomerNote.membership_id==member.id),
        row('profile',UserAction.id,UserAction.created_at,UserAction.action).where(UserAction.entity=='customers',UserAction.entity_id==customer_id,UserAction.payload.contains('"business_id": "'+business_id+'"')),
        row('notification',UserNotification.id,UserNotification.created_at,UserNotification.title).where(or_(and_(UserNotification.entity_type=='food_orders',UserNotification.entity_id.in_(order_ids)),and_(UserNotification.entity_type=='business_customers',UserNotification.entity_id==member.id))),
    ]
    merged=union_all(*queries).subquery()
    rows=(await db.execute(select(merged).order_by(merged.c.at.desc(),merged.c.kind,merged.c.id.desc()).offset(offset).limit(limit+1))).mappings().all()
    return {'items':[dict(x) for x in rows[:limit]],'next_offset':offset+limit if len(rows)>limit else None}
