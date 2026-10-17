"""Financial state derived independently of the existing delivery lifecycle."""
from sqlalchemy import and_, func, case
from models.food_orders import Food_orders
from services.dam_order_workflow import money, paid

def is_debt(order):
    return (getattr(order,'status',None) == 'done' and order.payment_status not in ('paid', 'refunded')
            and paid(order) < money(order.total_amount))

def debt_condition():
    received=func.coalesce(Food_orders.paid_amount,case((Food_orders.payment_status=='paid',Food_orders.total_amount),else_=0))
    return and_(Food_orders.status=='done',func.coalesce(Food_orders.payment_status,'pending').notin_(('paid','refunded')),
                received < Food_orders.total_amount)

def settlement_view(order):
    received=paid(order); total=money(order.total_amount)
    refund_due=max(money(0),received-(money(0) if order.status=='cancelled' else total))
    state=('REFUND_REQUIRED' if refund_due else 'REFUNDED' if order.payment_status=='refunded'
           else 'CANCELLED_NO_PAYMENT' if order.status=='cancelled'
           else 'DEBT' if is_debt(order) else 'PARTIALLY_REFUNDED' if order.payment_status=='paid' and received<total
           else 'PAID' if order.payment_status=='paid' else 'AWAITING_PAYMENT')
    return {'settlement_state':state,'is_debt':is_debt(order),'debt_amount':float(max(money(0),total-received)) if is_debt(order) else 0,
            'refund_due':float(refund_due)}
