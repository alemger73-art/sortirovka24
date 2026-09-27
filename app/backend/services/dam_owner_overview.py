"""Read-only projections of the existing DAM orders, staff and delivery journal."""
from datetime import datetime, timezone
from sqlalchemy import select, func
from models.partner_auth import PartnerCredentials
from models.food_orders import Food_orders
from models.food_shifts import FoodShift, FoodStaffAction
from models.logistics import CourierProfile, LogisticsTask
from models.auth import User
from services.food_operations import scope
from services.food_shifts import shift_view


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value and value.tzinfo is None else value.isoformat() if value else None


def minutes_since(value):
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
        if not dt:
            return None
        return (datetime.now(timezone.utc) - (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc))).total_seconds() / 60
    except (TypeError, ValueError):
        return None


async def overview(db):
    condition = await scope(db)
    credentials = (await db.scalars(select(PartnerCredentials).where(PartnerCredentials.partner_type == 'dam_alem'))).all()
    couriers = (await db.execute(select(CourierProfile, User).join(User, User.id == CourierProfile.user_id).where(CourierProfile.is_verified == True))).all()
    shifts = (await db.scalars(select(FoodShift).where(FoodShift.active_key.is_not(None)))).all()
    shift_map = {(s.staff_type, s.staff_id): shift_view(s) for s in shifts}
    last_ids = select(func.max(FoodStaffAction.id)).group_by(FoodStaffAction.staff_type, FoodStaffAction.staff_id)
    actions = (await db.scalars(select(FoodStaffAction).where(FoodStaffAction.id.in_(last_ids)))).all()
    action_map = {(a.staff_type, a.staff_id): {'action': a.action, 'at': iso(a.created_at), 'entity_id': a.entity_id} for a in actions}
    tasks = (await db.scalars(select(LogisticsTask).join(Food_orders, (LogisticsTask.source_type == 'food_orders') & (LogisticsTask.source_id == Food_orders.id)).where(condition, Food_orders.status.notin_(['done', 'cancelled'])))).all()
    team = []
    for kind, id, name, login, role, active in [
        *[('partner', str(p.id), p.display_name, p.email or p.phone, p.access_role or 'owner', p.is_active) for p in credentials],
        *[('courier', p.user_id, u.name, p.phone or u.phone, 'courier', p.is_verified) for p, u in couriers],
    ]:
        team.append({'id': id, 'type': kind, 'name': name or login, 'login': login, 'role': role, 'active': active,
                     'shift': shift_map.get((kind, id)), 'last_action': action_map.get((kind, id)),
                     'deliveries': [t.source_id for t in tasks if t.courier_id == id] if kind == 'courier' else []})
    attention = []
    if not any(p['role'] == 'operator' and p['active'] and p['shift'] for p in team):
        attention.append({'key': 'no_operator', 'text': 'Нет оператора на смене', 'section': 'staff'})
    # Compare delivery timestamps, not order creation time: a pre-order can be old.
    for task in tasks:
        elapsed = minutes_since(task.picked_up_at if task.status in ('picked_up', 'on_the_way') else task.ready_at)
        if elapsed is not None and elapsed >= (60 if task.status in ('picked_up', 'on_the_way') else 20):
            if task.status in ('picked_up', 'on_the_way', 'ready', 'pending', 'assigned'):
                attention.append({'key': f'delivery:{task.id}', 'text': f'Заказ №{task.source_id}: ' + ('доставка более часа' if task.status in ('picked_up', 'on_the_way') else 'ожидает курьера более 20 минут'), 'section': 'orders', 'order_id': task.source_id})
    new_orders = (await db.scalars(select(Food_orders).where(condition, Food_orders.status == 'new').order_by(Food_orders.id).limit(20))).all()
    for order in new_orders:
        elapsed = minutes_since(order.created_at)
        if elapsed is not None and elapsed >= 10:
            attention.append({'key': f'new:{order.id}', 'text': f'Заказ №{order.id}: новый более 10 минут', 'section': 'orders', 'order_id': order.id})
    unpaid = (await db.scalars(select(Food_orders).where(condition, Food_orders.status == 'done',
        (Food_orders.payment_status != 'paid') | Food_orders.payment_status.is_(None)).order_by(Food_orders.id.desc()).limit(5))).all()
    for order in unpaid:
        attention.append({'key': f'unpaid:{order.id}', 'text': f'Заказ №{order.id}: завершён, оплата не подтверждена', 'section': 'orders', 'order_id': order.id})
    orders = (await db.scalars(select(Food_orders).where(condition).order_by(Food_orders.id.desc()).limit(5))).all()
    return {'team': team, 'attention': attention[:8], 'attention_total': len(attention), 'recent_orders': [
        {'id': o.id, 'name': o.customer_name, 'status': o.status, 'amount': o.total_amount,
         'source': o.order_source or 'app', 'delivery_method': o.delivery_method} for o in orders]}
