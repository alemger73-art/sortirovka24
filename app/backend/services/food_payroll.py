import json
import hashlib
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy import select, func, or_, and_
from datetime import date
from models.food_payroll import FoodPayrollEmployee, FoodPayrollDay, FoodPayrollWork, FoodPayrollPayment
from models.food_orders import Food_orders
from models.food_items import Food_items
from services.dam_order_workflow import money, items, subtotal
from services.food_operations import scope

CITY=timezone(timedelta(hours=5))
def local_day(raw):
    if not raw: return None
    try:
        value=datetime.fromisoformat(raw.replace('Z','+00:00'))
        return value.replace(tzinfo=timezone.utc).astimezone(CITY).date().isoformat() if value.tzinfo is None else value.astimezone(CITY).date().isoformat()
    except (ValueError,TypeError): return None

async def calculate(db, day):
    employees={x.id:x for x in (await db.scalars(select(FoodPayrollEmployee))).all()}
    work=(await db.scalars(select(FoodPayrollWork).where(FoodPayrollWork.day==day))).all()
    catalog={x.id:x.sales_department for x in (await db.scalars(select(Food_items))).all()}
    lower=(date.fromisoformat(day)-timedelta(days=1)).isoformat()
    upper=(date.fromisoformat(day)+timedelta(days=2)).isoformat()
    date_filter=or_(*[and_(field>=lower,field<upper) for field in (Food_orders.created_at,Food_orders.paid_at,Food_orders.completed_at)])
    orders=(await db.scalars(select(Food_orders).where(await scope(db),date_filter))).all()
    sales={'kitchen':Decimal(0),'bar':Decimal(0),'unassigned':Decimal(0)}
    order_ids=[];pending=0
    for order in orders:
        if order.status not in ('done','cancelled') or (order.status=='done' and order.payment_status!='paid'):
            if local_day(order.created_at)==day: pending+=1
            continue
        if order.status!='done' or order.payment_status!='paid': continue
        # Recognize only when both completion and full payment are recorded.
        earned=max(filter(None,[local_day(order.completed_at),local_day(order.paid_at),local_day(order.created_at)]),default=None)
        if earned!=day: continue
        lines=items(order);gross=subtotal(lines)
        if gross<=0: continue
        net=max(Decimal(0),gross-money(order.promo_discount_amount)-money(order.bonus_discount_amount))
        order_ids.append(order.id)
        for line in lines:
            department=line.get('department') or catalog.get(line.get('id')) or 'unassigned'
            if department not in sales: department='unassigned'
            line_total=(money(line.get('price'))+money(line.get('modTotal')))*int(line.get('quantity') or 1)
            sales[department]+=net*line_total/gross
    rows=[]
    for entry in work:
        employee=employees.get(entry.employee_id)
        basis_amount=sum(sales.values()) if entry.basis=='all' else sales.get(entry.basis,Decimal(0))
        commission=money(basis_amount*money(entry.percent)/100)
        rows.append({'employee_id':entry.employee_id,'name':employee.name if employee else str(entry.employee_id),
            'position':employee.position if employee else '', 'daily_base':entry.daily_base,'percent':entry.percent,
            'basis':entry.basis,'sales':float(money(basis_amount)),'commission':float(commission),
            'total':float(money(entry.daily_base)+commission)})
    report={'day':day,'rows':rows,'sales':{k:float(money(v)) for k,v in sales.items()},'order_ids':sorted(order_ids),
            'pending_orders':pending,'unassigned':float(money(sales['unassigned'])),
            'total':float(sum(money(row['total']) for row in rows))}
    report['fingerprint']=hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()
    return report

async def report(db, day):
    period=await db.get(FoodPayrollDay,day)
    current=await calculate(db,day)
    result=json.loads(period.closed_json) if period and period.closed_json else current
    payments=(await db.scalars(select(FoodPayrollPayment).where(FoodPayrollPayment.day==day).order_by(FoodPayrollPayment.created_at))).all()
    for row in result['rows']:
        received=sum(money(x.amount) for x in payments if x.employee_id==row['employee_id'] and not x.voided)
        row['paid']=float(received);row['remaining']=float(money(row['total'])-received)
    result['closed']=bool(period and period.closed_json)
    result['version']=period.version if period else 0
    result['new_sales_after_close']=len(set(current['order_ids'])-set(result['order_ids'])) if result['closed'] else 0
    result['payments']=[{'id':x.id,'employee_id':x.employee_id,'amount':x.amount,'note':x.note,'created_at':x.created_at,'voided':bool(x.voided),'void_reason':x.void_reason} for x in payments]
    return result
