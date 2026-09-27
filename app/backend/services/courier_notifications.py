"""Courier operational notifications through the existing user/push infrastructure."""
import logging
import hashlib
from models.logistics import CourierProfile
from services.user_notifications import send_user_notification

async def notify_courier_task(db, task, kind, *, version='', courier_id=None):
    user_id = courier_id or task.courier_id
    if not user_id:
        return
    try:
        profile = await db.get(CourierProfile, user_id)
        if not profile or not profile.is_verified:
            return
        titles = {'assigned':'Новая доставка', 'reassigned':'Доставка переназначена',
                  'cancelled':'Доставка отменена', 'issue_resolved':'Проблема доставки решена'}
        await send_user_notification(db, user_id=user_id, category='logistics',
            event_key='courier:'+hashlib.sha256(f'{kind}:{task.id}:{version}:{user_id}'.encode()).hexdigest(),
            title=f'{titles[kind]} №{task.source_id}', body='Откройте кабинет курьера для актуальных деталей.',
            path='/food/courier', entity_type='logistics_tasks', entity_id=str(task.id))
    except Exception:
        logging.getLogger(__name__).exception('Delivery saved; courier notification failed')
        await db.rollback()
