"""Read-only operational money overview; never infer received money from delivery."""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy import select, or_
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.food_cashbox import FoodCashEntry
from models.logistics import LogisticsTask
from models.courier_workflow import CourierLedger
from models.auth import User
from services.food_operations import scope
from services.food_payments import movement
from services.dam_order_workflow import money, paid
from services.food_shifts import active_shift
from services.food_cashbox import snapshot

def utc(value):
    if isinstance(value,str):
        try:value=datetime.fromisoformat(value.replace('Z','+00:00'))
        except ValueError:return None
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value

async def dashboard(db,claims):
    now=datetime.now(timezone.utc)
    shift=await active_shift(db,'partner',str(claims.get('staff_id') or claims.get('sub')))
    start=utc(shift.opened_at) if shift else now.astimezone(timezone(timedelta(hours=5))).replace(hour=0,minute=0,second=0,microsecond=0).astimezone(timezone.utc)
    orders=(await db.scalars(select(Food_orders).where(await scope(db)))).all()
    ids=[o.id for o in orders]
    totals={k:Decimal(0) for k in ('cash','kaspi_qr','halyk_qr','other','refunds')}
    events=(await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id.in_(ids),FoodOrderEvent.public_data.is_not(None)))).all()
    undated=0;payment_entries=[]
    for event in events:
        data=movement(event)
        if not data:continue
        at=utc(event.created_at)
        if not at:undated+=1;continue
        if not start<=at<=now:continue
        amount=money(data['amount'])
        payment_entries.append({'id':event.id,'order_id':event.order_id,'amount':float(amount),
            'method':data['method'],'actor':event.actor,'created_at':at.isoformat(),'cash_location':data.get('cash_location')})
        if amount<0:totals['refunds']-=amount
        else:totals[data['method'] if data['method'] in totals and data['method']!='refunds' else 'other']+=amount
    entries=(await db.scalars(select(FoodCashEntry))).all()
    configured=any(e.entry_key=='opening' for e in entries)
    prior=sum((money(e.amount) for e in entries if utc(e.created_at) and utc(e.created_at)<start),Decimal(0))
    during=[e for e in entries if utc(e.created_at) and start<=utc(e.created_at)<=now]
    incoming=sum((money(e.amount) for e in during if money(e.amount)>0),Decimal(0))
    outgoing=-sum((money(e.amount) for e in during if money(e.amount)<0),Decimal(0))
    tasks=(await db.scalars(select(LogisticsTask).where(LogisticsTask.source_type=='food_orders',LogisticsTask.source_id.in_(ids)))).all()
    by_order={t.source_id:t for t in tasks}
    couriers={}
    async def courier(cid):
        if cid not in couriers:
            user=await db.get(User,cid)
            couriers[cid]={'id':cid,'name':user.name if user else 'Курьер','cash_held':Decimal(0),'expected_cash':Decimal(0),'payout_due':Decimal(0),'orders':[]}
        return couriers[cid]
    ledger=(await db.scalars(select(CourierLedger).where(CourierLedger.order_id.in_(ids)))).all()
    # Payout/adjustment rows may have no order ID; restrict them to DAM couriers already present.
    cids=set(t.courier_id for t in tasks if t.courier_id)|set(e.courier_id for e in ledger)
    ledger=(await db.scalars(select(CourierLedger).where(CourierLedger.courier_id.in_(cids),or_(CourierLedger.order_id.in_(ids),CourierLedger.order_id.is_(None))))).all()
    for entry in ledger:
        row=await courier(entry.courier_id)
        if entry.event_type in ('cash_collected','cash_adjustment'):row['cash_held']+=money(entry.amount)
        elif entry.event_type=='cash_handed_over':row['cash_held']-=money(entry.amount)
        elif entry.event_type=='earning':row['payout_due']+=money(entry.amount)
        elif entry.event_type=='payout':row['payout_due']-=money(entry.amount)
    debts=[];awaiting=[];refunds=[]
    for order in orders:
        due=max(Decimal(0),money(order.total_amount)-paid(order))
        item={'id':order.id,'customer':order.customer_name,'amount':float(due),'method':order.payment_method,'status':order.status}
        if order.status=='done' and due:debts.append(item)
        elif order.status!='cancelled' and due:awaiting.append(item)
        refundable=max(Decimal(0),paid(order)-(Decimal(0) if order.status=='cancelled' else money(order.total_amount)))
        if refundable:refunds.append({**item,'amount':float(refundable)})
        task=by_order.get(order.id)
        if task and task.courier_id and order.status!='cancelled' and order.payment_method=='cash' and due:
            row=await courier(task.courier_id)
            row['expected_cash']+=due;row['orders'].append(item)
    return {'period':{'from':start.isoformat(),'to':now.isoformat(),'kind':'shift' if shift else 'today','shift_id':shift.id if shift else None},
        'cashbox':await snapshot(db),'cash_movement':{'start':float(prior) if configured and any(utc(e.created_at)<start for e in entries if e.entry_key=='opening') else None,'incoming':float(incoming),'outgoing':float(outgoing)},
        'payments':{k:float(v) for k,v in totals.items()},'couriers':[{**r,**{k:float(r[k]) for k in ('cash_held','expected_cash','payout_due')}} for r in couriers.values()],
        'debts':debts,'awaiting_payment':awaiting,'refunds_pending':refunds,'undated_payments':undated,
        'payment_entries':sorted(payment_entries,key=lambda e:(e['created_at'],e['id']),reverse=True)[:100]}
