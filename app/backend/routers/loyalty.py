"""Customer read/referral access and owner-only financial administration."""
import csv
import io
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select, func
from core.database import get_db
from core.food_staff_guard import food_owner
from models.auth import User
from models.user_management import Bonus
from models.loyalty import BonusReview, BonusMember
from models.crm import Customer, BusinessCustomer
from services.crm import DAM, scoped_customer
from services import loyalty as service
from services.account_session import resolve_account_user
from utils.rate_limit import check_keyed_rate_limit

router = APIRouter(prefix='/api/v1/dam-alem/loyalty', tags=['loyalty'])


def actor(claims):
    return {'id': str(claims.get('staff_id') or claims.get('partner_id') or claims.get('sub') or 'admin'), 'role': 'owner'}


async def client_user(authorization: str | None = Header(None), db=Depends(get_db)):
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(401, 'Войдите в личный кабинет')
    return user


class StrictBody(BaseModel):
    model_config = ConfigDict(extra='forbid')


class ReferralBody(StrictBody):
    code: str = Field(min_length=16, max_length=48, pattern=r'^[A-Za-z0-9_-]+$')


class Adjustment(StrictBody):
    customer_id: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=-100000000, lt=100000000, allow_inf_nan=False)
    reason: str = Field(min_length=3, max_length=500)
    request_key: UUID


class ReviewBody(StrictBody):
    approved: bool
    reason: str = Field(min_length=3, max_length=500)


@router.get('/me')
async def mine(db=Depends(get_db), user=Depends(client_user)):
    data = await service.summary(db, user.id)
    await db.commit()
    return data


@router.post('/referral')
async def referral(body: ReferralBody, db=Depends(get_db), user=Depends(client_user)):
    check_keyed_rate_limit(f'loyalty:referral:{user.id}', max_hits=10, window_seconds=3600)
    await service.bind_referrer(db, user, body.code)
    await db.commit()
    return {'ok': True}


@router.get('/owner/settings')
async def settings(db=Depends(get_db), _=Depends(food_owner)):
    data = await service.rules(db)
    await db.commit()
    return data


@router.patch('/owner/settings')
async def change_settings(body: dict, db=Depends(get_db), claims=Depends(food_owner)):
    data = await service.configure(db, body, actor(claims))
    await db.commit()
    return data


@router.post('/owner/adjustments')
async def adjustment(body: Adjustment, db=Depends(get_db), claims=Depends(food_owner)):
    check_keyed_rate_limit(f'loyalty:adjust:{actor(claims)["id"]}', max_hits=60, window_seconds=3600)
    await scoped_customer(db,DAM,body.customer_id)
    await service.adjust(db, body.customer_id, body.amount, body.reason, str(body.request_key), actor(claims))
    await db.commit()
    return {'ok': True}


@router.post('/owner/reviews/{review_id}')
async def review(review_id: int, body: ReviewBody, db=Depends(get_db), claims=Depends(food_owner)):
    await service.resolve_review(db, review_id, body.approved, body.reason, actor(claims))
    await db.commit()
    return {'ok': True}


def bounds(start, end):
    zone = timezone(timedelta(hours=5))
    today = datetime.now(zone).date()
    start, end = start or today-timedelta(days=29), end or today
    if end < start or (end-start).days > 366:
        raise HTTPException(422, 'Укажите период до 366 дней')
    return datetime.combine(start, time.min, zone), datetime.combine(end+timedelta(days=1), time.min, zone)


@router.get('/owner')
async def dashboard(start: date | None = None, end: date | None = None, db=Depends(get_db), _=Depends(food_owner)):
    begin, finish = bounds(start, end)
    await service.policy(db, lock=True)
    ids = (await db.scalars(select(BonusMember.id).where(BonusMember.business_id==DAM))).all()
    for uid in ids:
        await service.expire(db, await service.account(db, uid))
    grouped = (await db.execute(select(Bonus.kind, func.sum(Bonus.points)).where(Bonus.business_id == DAM, Bonus.created_at >= begin, Bonus.created_at < finish).group_by(Bonus.kind))).all()
    totals = {kind: value for kind, value in grouped}
    liability = await db.scalar(select(func.coalesce(func.sum(BonusMember.bonus_balance), 0)).where(BonusMember.business_id==DAM))
    customers = await db.scalar(select(func.count()).select_from(BusinessCustomer).where(BusinessCustomer.business_id==DAM))
    with_balance = await db.scalar(select(func.count()).select_from(BonusMember).where(BonusMember.business_id==DAM,BonusMember.bonus_balance > 0))
    reviews = (await db.scalars(select(BonusReview).join(BonusMember,BonusMember.id==BonusReview.account_id).where(BonusMember.business_id==DAM,BonusReview.status == 'REVIEW').order_by(BonusReview.id.desc()).limit(100))).all()
    data = {'totals': totals, 'liability': liability, 'customers': customers, 'with_balance': with_balance,
        'review_count': await db.scalar(select(func.count()).select_from(BonusReview).join(BonusMember,BonusMember.id==BonusReview.account_id).where(BonusMember.business_id==DAM,BonusReview.status == 'REVIEW')),
        'reviews': [{'id': r.id, 'account_id': r.account_id, 'order_id': r.order_id, 'kind': r.kind, 'reason': r.reason, 'details': r.details} for r in reviews],
        'rules': await service.rules(db)}
    await db.commit()
    return data


@router.get('/owner/customers')
async def customers(q: str = Query('', max_length=100), db=Depends(get_db), _=Depends(food_owner)):
    from sqlalchemy import or_
    rows=(await db.execute(select(Customer,BonusMember).join(BonusMember,BonusMember.customer_id==Customer.id).where(
        BonusMember.business_id==DAM, or_(Customer.name.ilike('%'+q+'%'),Customer.normalized_phone.ilike('%'+q+'%'))).order_by(Customer.name).limit(40))).all()
    return [{'id':c.id,'name':c.name,'phone':'***'+c.normalized_phone[-4:],'balance':m.bonus_balance} for c,m in rows]


@router.get('/owner/settings-history')
async def settings_history(db=Depends(get_db), _=Depends(food_owner)):
    import json
    from models.user_management import UserAction
    rows=(await db.scalars(select(UserAction).where(UserAction.action=='loyalty_settings_changed',UserAction.entity_id==DAM).order_by(UserAction.id.desc()).limit(100))).all()
    return [{'id':r.id,'date':r.created_at,**json.loads(r.payload)} for r in rows]


@router.get('/owner/history')
async def history(start: date | None = None, end: date | None = None, offset: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=500), customer_id: str | None = None, db=Depends(get_db), _=Depends(food_owner)):
    begin, finish = bounds(start, end)
    query = select(Bonus, Customer).join(Customer, Customer.id == Bonus.customer_id).where(Bonus.business_id == DAM, Bonus.created_at >= begin, Bonus.created_at < finish)
    if customer_id:
        query = query.where(Bonus.customer_id == customer_id)
    rows = (await db.execute(query.order_by(Bonus.id.desc()).offset(offset).limit(limit))).all()
    return [{'id': b.id, 'date': b.created_at, 'customer': u.name or u.id, 'customer_id': u.id,
        'phone': ('***'+u.normalized_phone[-4:]) if u.normalized_phone else '', 'type': b.kind, 'amount': b.points, 'order': b.order_id,
        'reason': b.reason, 'expires': b.expires_at, 'actor': b.created_by, 'balance': b.balance_after} for b, u in rows]


@router.get('/owner/export')
async def export(start: date | None = None, end: date | None = None, db=Depends(get_db), claims=Depends(food_owner)):
    begin, finish = bounds(start, end)
    rows = (await db.execute(select(Bonus, Customer).join(Customer, Customer.id == Bonus.customer_id)
        .where(Bonus.business_id == DAM, Bonus.created_at >= begin, Bonus.created_at < finish).order_by(Bonus.id))).all()
    out = io.StringIO(); writer = csv.writer(out)
    writer.writerow(['Дата', 'Клиент', 'Телефон', 'Тип', 'Сумма', 'Заказ', 'Причина', 'Срок', 'Автор'])
    def cell(value):
        value = str(value or '')
        return "'"+value if value[:1] in ('=', '+', '-', '@', '\t', '\r') else value
    for b, u in rows:
        writer.writerow([cell(x) for x in (b.created_at, u.name, '***'+(u.normalized_phone or '')[-4:], b.kind, b.points, b.order_id, b.reason, b.expires_at, b.created_by)])
    service.audit(db, 'loyalty_export', actor(claims), 'bonuses', 'export', {'start': begin, 'end': finish, 'count': len(rows)})
    await db.commit()
    return Response('\ufeff'+out.getvalue(), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': 'attachment; filename="dam-loyalty.csv"'})
