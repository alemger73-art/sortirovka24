"""Read-only courier cards: own assignments, current payments and operator replies."""
from sqlalchemy import select
from models.food_orders import Food_orders
from models.food_restaurants import Food_restaurants
from models.courier_workflow import CourierDeliveryIssue, CourierLedger
from services.logistics_service import task_to_dict
from services.dam_order_workflow import money, paid
from services.food_operations import brand


async def task_cards(db, tasks, courier_id):
    tasks=[t for t in tasks if str(t.courier_id)==str(courier_id)]
    ids=[t.id for t in tasks]
    order_ids=[t.source_id for t in tasks if t.source_type=='food_orders']
    orders={o.id:o for o in (await db.scalars(select(Food_orders).where(Food_orders.id.in_(order_ids)))).all()}
    issues=(await db.scalars(select(CourierDeliveryIssue).where(
        CourierDeliveryIssue.task_id.in_(ids),CourierDeliveryIssue.courier_id==str(courier_id)
    ).order_by(CourierDeliveryIssue.id.desc()))).all()
    earnings=(await db.scalars(select(CourierLedger).where(
        CourierLedger.task_id.in_(ids),CourierLedger.courier_id==str(courier_id),CourierLedger.event_type=='earning'
    ))).all()
    earned={}
    for row in earnings:earned[row.task_id]=earned.get(row.task_id,money(0))+money(row.amount)
    result=[]
    for task in tasks:
        card=task_to_dict(task)
        order=orders.get(task.source_id) if task.source_type=='food_orders' else None
        if order:
            card.update(payment_method=order.payment_method,payment_status=order.payment_status,
                order_source=order.order_source or 'app',
                cash_given_amount=order.cash_given_amount,change_amount=order.change_amount,
                order_status=order.status,amount_due=float(max(money(0),money(order.total_amount)-paid(order))))
        card['earned_payout']=float(earned[task.id]) if task.id in earned else None
        card['delivery_issues']=[{'id':r.id,'reason':r.reason,'comment':r.comment,'status':r.status,
            'resolution':r.resolution,'resolved_by':r.resolved_by,
            'created_at':r.created_at.isoformat() if r.created_at else None,
            'resolved_at':r.resolved_at.isoformat() if r.resolved_at else None}
            for r in issues if r.task_id==task.id]
        result.append(card)
    return result


async def dispatch_contact(db):
    # The owner's existing venue contact; never expose staff passwords, PINs or private directory.
    venues=(await db.scalars(select(Food_restaurants).where(Food_restaurants.is_active.is_not(False))
        .order_by(Food_restaurants.id))).all()
    venue=next((v for v in venues if v.merchant_key=='dam_alem'),None)
    if not venue:venue=next((v for v in venues if brand(v.name,v.merchant_key)),None)
    return {'name':'DAM ALEM','phone':venue.whatsapp_phone if venue else None}
