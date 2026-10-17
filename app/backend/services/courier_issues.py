"""Delivery exception lifecycle on existing FoodOrder + LogisticsTask."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from models.courier_workflow import CourierDeliveryIssue
from models.logistics import LogisticsTask, CourierProfile
from models.auth import User
from models.food_orders import Food_orders
from services.food_preorders import lock_dam_operations
from services.food_shifts import require_courier_shift, require_partner_shift, record_action, active_shift
from services.dam_order_workflow import claim, task_for
from services.food_operations import add_event, now

ISSUE_LABELS={'no_answer':'Клиент не отвечает','wrong_address':'Неверный адрес','refused':'Отказ клиента',
              'payment':'Проблема с оплатой','transport':'Проблема с транспортом','other':'Другое'}

async def create_issue(db, task_id, user, body, claims=None):
    await lock_dam_operations(db)
    task=await db.scalar(select(LogisticsTask).where(LogisticsTask.id==task_id).with_for_update())
    if not task or task.courier_id!=str(user.id):raise HTTPException(404,'Доставка не найдена')
    if task.status not in ('assigned','picked_up','on_the_way','arrived'):raise HTTPException(409,'Доставка уже закрыта')
    if task.source_type!='food_orders':raise HTTPException(409,'Не заказ DÄM ALEM')
    from services.food_operations import scope
    order=await db.scalar(select(Food_orders).where(Food_orders.id==task.source_id,await scope(db)))
    if not order:raise HTTPException(404,'Заказ DÄM ALEM не найден')
    profile=await db.get(CourierProfile,str(user.id))
    shift=await require_partner_shift(db,claims) if claims else await require_courier_shift(db,profile)
    issue_shift=shift or await active_shift(db,'courier',user.id)
    if not issue_shift:raise HTTPException(409,'Для регистрации проблемы нужна открытая смена сотрудника или курьера')
    if body.reason=='other' and not body.comment.strip():raise HTTPException(422,'Опишите проблему')
    key=f'{task_id}:{body.reason}'
    existing=await db.scalar(select(CourierDeliveryIssue).where(CourierDeliveryIssue.active_key==key))
    if existing:return existing
    row=CourierDeliveryIssue(task_id=task_id,order_id=order.id,courier_id=str(user.id),shift_id=issue_shift.id,
        active_key=key,reason=body.reason,comment=body.comment.strip(),status='open')
    db.add(row);await db.flush()
    record_action(db,shift,'delivery_issue_created',claims=claims,entity_type='order',entity_id=order.id,details={'issue_id':row.id,'reason':body.reason,'comment':body.comment.strip(),'source':'operator' if claims else 'courier'})
    actor=(claims.get('display_name') or claims.get('sub') or 'Оператор') if claims else user.name or 'Курьер'
    add_event(db,order,f'Проблема доставки: {ISSUE_LABELS[body.reason]}. {body.comment.strip()}',actor,notify=False)
    return row

async def resolve_issue(db, issue, resolution, claims):
    if issue.status!='open':return
    if not resolution.strip():raise HTTPException(422,'Укажите решение проблемы')
    issue.status='resolved';issue.active_key=None;issue.resolution=resolution.strip()
    issue.resolved_by=str(claims.get('display_name') or claims.get('sub') or 'Сотрудник')
    issue.resolved_at=datetime.now(timezone.utc)
    order=await db.get(Food_orders,issue.order_id)
    if order:add_event(db,order,'Проблема доставки решена: '+resolution.strip(),issue.resolved_by,notify=False)
    record_action(db,None,'delivery_issue_resolved',claims=claims,staff_type=claims.get('staff_type','partner'),entity_type='order',entity_id=issue.order_id,
        details={'issue_id':issue.id,'resolution':issue.resolution})

async def resolve_terminal_issues(db, task, resolution, claims):
    """Close outstanding exceptions in the same transaction as the task."""
    issues=(await db.scalars(select(CourierDeliveryIssue).where(
        CourierDeliveryIssue.task_id==task.id,CourierDeliveryIssue.status=='open'))).all()
    for issue in issues:
        await resolve_issue(db,issue,resolution,claims)

async def reassign(db, order, body, claims):
    await lock_dam_operations(db)
    if order.status!='in_progress' or order.delivery_method not in ('delivery','доставка'):
        raise HTTPException(409,'Переназначение доступно для доставки в пути')
    if order.version!=body.expected_version:raise HTTPException(409,'Заказ уже изменён. Обновите карточку.')
    task=await task_for(db,order)
    if not task or task.status not in ('assigned','picked_up','on_the_way','arrived'):raise HTTPException(409,'Нет активной доставки')
    if task.courier_id==body.courier_id:raise HTTPException(409,'Этот курьер уже назначен')
    user=await db.get(User,body.courier_id)
    from services.courier_money import lock_wallet
    profile=await lock_wallet(db,body.courier_id)
    if not user or not user.is_active or user.status!='active' or not profile.is_verified or not await active_shift(db,'courier',body.courier_id):
        raise HTTPException(409,'Новый курьер должен иметь активный доступ и открытую смену')
    await claim(db,order,body.expected_version)
    previous=task.courier_id
    task.courier_id=body.courier_id;task.status='assigned';task.handed_at=now();task.picked_up_at=None;task.departed_at=None;task.arrived_at=None
    name=str(claims.get('display_name') or claims.get('sub') or 'Оператор')
    add_event(db,order,f'Курьер переназначен: {previous} → {user.name}. Причина: {body.reason.strip()}',name,notify=False)
    record_action(db,None,'courier_reassigned',claims=claims,entity_type='order',entity_id=order.id,
        details={'old_courier_id':previous,'new_courier_id':body.courier_id,'reason':body.reason.strip(),'task_id':task.id})
    issues=(await db.scalars(select(CourierDeliveryIssue).where(CourierDeliveryIssue.task_id==task.id,CourierDeliveryIssue.status=='open'))).all()
    for issue in issues:await resolve_issue(db,issue,'Переназначено: '+body.reason.strip(),claims)
    await db.commit();await db.refresh(task)
    from services.courier_notifications import notify_courier_task
    await notify_courier_task(db,task,'reassigned',version=order.version,courier_id=previous)
    await notify_courier_task(db,task,'assigned',version=order.version)
    return task
