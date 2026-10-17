"""Accept requests automatically; complete erasure only after a documented data review.

Orders, financial ledgers, media providers and legacy phone-linked records need
operator review. A request must never be labelled completed just by blocking login.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import String, inspect, and_, cast, delete, false, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.account_deletion import AccountDeletionRequest
from models.auth import User
from models.user_addresses import UserAddress
from models.user_management import UserSession
from models.user_preferences import User_preferences
from models.user_notifications import UserNotification
from models.push_devices import PushDevice
try:
    from models.push_campaigns import PushCampaignRecipient
except ModuleNotFoundError as exc:
    if exc.name != "models.push_campaigns":
        raise
    PushCampaignRecipient = None
from models.crm import BusinessCustomer, Customer
from models.crm import CustomerIdentity, CustomerNote, ChannelConfirmation
from models.announcements import Announcements
from models.real_estate import Real_estate
from models.complaints import Complaints
from models.become_master_requests import Become_master_requests
from models.master_reviews import Master_reviews
try:
    from models.analytics import AnalyticsEvent, AnalyticsIdentity
except ModuleNotFoundError as exc:
    if exc.name != "models.analytics":
        raise
    AnalyticsEvent = AnalyticsIdentity = None
from models.user_management import PhoneVerification, UserAction
from uuid import uuid4
from models.food_orders import Food_orders
from models.gastronom_orders import Gastronom_orders
from models.pharmacy_orders import Pharmacy_orders
from models.prorab_orders import Prorab_orders
from models.volna_orders import Volna_orders
from models.park_orders import Park_orders
from models.taxi import TaxiRide
from models.logistics import LogisticsTask
from models.user_management import Order
from utils.phone import phone_suffix_expression, phone_digits

TERMINAL = {"done", "completed", "delivered", "cancelled", "canceled", "rejected"}


def order_owner(model, user):
    clauses = []
    owner = getattr(model, "user_id", None)
    if owner is not None:
        clauses.append(cast(owner, String) == user.id)
    if model is Food_orders:
        clauses.append(model.customer_id.in_(select(Customer.id).where(Customer.user_id == user.id)))
    if user.phone_verified_at and user.phone:
        phone = getattr(model, "customer_phone", None)
        if phone is not None:
            # Never match another account's explicitly owned records by phone.
            unowned = and_(or_(owner.is_(None), cast(owner, String) == "")) if owner is not None else True
            clauses.append(and_(unowned, phone_suffix_expression(phone) == phone_digits(user.phone)[-10:]))
    return or_(*clauses) if clauses else false()


async def available_tables(db):
    # Older installations legitimately have no optional analytics/push modules.
    # Inspect before issuing SQL: catching UndefinedTable would abort a PG transaction.
    return await db.run_sync(lambda session: set(inspect(session.connection()).get_table_names()))


async def review_inventory(db, user):
    """Counts support an actual operator review; unknown statuses stay unfinished."""
    tables = await available_tables(db)
    active = {}
    for model in (Food_orders, Gastronom_orders, Pharmacy_orders, Prorab_orders, Volna_orders, Park_orders, Order):
        if model.__tablename__ not in tables:
            continue
        status = func.lower(func.coalesce(model.status, ""))
        count = await db.scalar(select(func.count()).select_from(model).where(order_owner(model, user), status.notin_(TERMINAL)))
        if count:
            active[model.__tablename__] = count
    for model, owner in ((TaxiRide, or_(TaxiRide.user_id == user.id, TaxiRide.driver_id == user.id)),
                         (LogisticsTask, LogisticsTask.courier_id == user.id)):
        if model.__tablename__ not in tables:
            continue
        count = await db.scalar(select(func.count()).select_from(model).where(owner, func.lower(func.coalesce(model.status, "")).notin_(TERMINAL)))
        if count:
            active[model.__tablename__] = count
    media = [user.avatar_url] if user.avatar_url else []
    for model in (Announcements, Real_estate, Complaints, Become_master_requests):
        if model.__tablename__ not in tables:
            continue
        rows = (await db.scalars(select(model).where(model.user_id == user.id))).all()
        for row in rows:
            for key in ("image_url", "photo_url", "gallery_images", "complaint_video"):
                value = getattr(row, key, None)
                if value:
                    media.append(value)
    return {"active_operations": active, "media_references": media,
            "manual_review": ["phone-linked legacy records", "orders and payments and their snapshots",
                              "staff/business profiles and documents", "provider files and logs",
                              "legal receipts", "backups and processor deletion instructions"]}


async def request_deletion(db: AsyncSession, user: User) -> AccountDeletionRequest:
    # Serialize repeat clicks from different devices on PostgreSQL.
    user = await db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    if not user or user.status != "active" or not user.is_active:
        raise HTTPException(401, "Войдите в действующий аккаунт.")
    existing = await db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id))
    if existing:
        return existing
    now = datetime.now(timezone.utc)
    row = AccountDeletionRequest(user_id=user.id, status="pending", requested_at=now, due_at=now + timedelta(days=30))
    db.add(row)
    # Stop marketing immediately; the account remains usable during review of
    # unfinished orders. Do not silently disable or cancel paid deliveries.
    customer_ids = select(Customer.id).where(Customer.user_id == user.id)
    await db.execute(update(BusinessCustomer).where(BusinessCustomer.customer_id.in_(customer_ids)).values(marketing_opt_in=False))
    if PushCampaignRecipient is not None and PushCampaignRecipient.__tablename__ in await available_tables(db):
        await db.execute(delete(PushCampaignRecipient).where(PushCampaignRecipient.user_id == user.id, PushCampaignRecipient.status == "pending"))
    await db.commit()
    await db.refresh(row)
    return row


async def complete_deletion(db: AsyncSession, row: AccountDeletionRequest, *, actor: str,
                            evidence: str, retained_records: list[dict]) -> AccountDeletionRequest:
    """Finish after staff handled dependent systems and recorded retention grounds.

The endpoint requires an explicit operational attestation, not just a boolean
"delete". Staff must remove or anonymize other records before calling this.
"""
    if row.status == "completed":
        return row
    user = await db.scalar(select(User).where(User.id == row.user_id).with_for_update())
    if not user:
        raise HTTPException(409, "Учётная запись не найдена; требуется проверка данных.")
    if user.role in {"admin", "superadmin", "moderator"}:
        raise HTTPException(409, "Сначала передайте административный доступ другой учётной записи.")
    inventory = await review_inventory(db, user)
    if inventory["active_operations"]:
        raise HTTPException(409, "Есть незавершённые заказы или рабочие операции. Сначала завершите их обработку; заявка остаётся в очереди.")
    # The operator must explicitly identify why remaining operational records
    # are retained. Financial tables are not purged through this profile path.
    categories = {item["category"] for item in retained_records}
    if "operational_records" not in categories:
        raise HTTPException(422, "Укажите решение по заказам, платежам, рабочим записям и данным у обработчиков (operational_records).")
    legal_action = or_(UserAction.action.startswith("legal_"), UserAction.action == "food_order_legal_acceptance")
    if await db.scalar(select(UserAction.id).where(UserAction.user_id == user.id, legal_action).limit(1)):
        if "legal_receipts" not in categories:
            raise HTTPException(422, "Укажите основание и срок хранения журнала согласий (legal_receipts).")
    tables = await available_tables(db)
    # These stores have no accounting purpose; always remove them ourselves,
    # even when staff has already cleared related data in other systems.
    for model in (UserAddress, User_preferences, UserNotification, PushDevice, PushCampaignRecipient, UserSession):
        if model is not None and model.__tablename__ in tables:
            await db.execute(delete(model).where(model.user_id == user.id))
    for model in (Announcements, Real_estate, Complaints, Become_master_requests):
        if model is not None and model.__tablename__ in tables:
            await db.execute(delete(model).where(model.user_id == user.id))
    if Master_reviews.__tablename__ in tables:
        await db.execute(delete(Master_reviews).where(Master_reviews.reviewer_user_id == user.id))
    # Includes anonymous events linked to the same session, not only events
    # that happen to have their user_id populated.
    if AnalyticsEvent is not None and AnalyticsEvent.__tablename__ in tables:
        condition = AnalyticsEvent.user_id == user.id
        if AnalyticsIdentity is not None and AnalyticsIdentity.__tablename__ in tables:
            sessions = select(AnalyticsIdentity.session_id).where(AnalyticsIdentity.user_id == user.id)
            condition = condition | AnalyticsEvent.session_id.in_(sessions)
        await db.execute(delete(AnalyticsEvent).where(condition))
    if AnalyticsIdentity is not None and AnalyticsIdentity.__tablename__ in tables:
        await db.execute(delete(AnalyticsIdentity).where(AnalyticsIdentity.user_id == user.id))
    if user.phone:
        await db.execute(delete(PhoneVerification).where(PhoneVerification.phone == user.phone))
    # Keep only explicitly reviewed legal/financial audit receipts; other
    # activity payloads may contain free-text profile data.
    await db.execute(delete(UserAction).where(UserAction.user_id == user.id, ~legal_action))
    customers = (await db.scalars(select(Customer).where(Customer.user_id == user.id))).all()
    for customer in customers:
        memberships = select(BusinessCustomer.id).where(BusinessCustomer.customer_id == customer.id)
        await db.execute(delete(CustomerNote).where(CustomerNote.membership_id.in_(memberships)))
        await db.execute(delete(CustomerIdentity).where(CustomerIdentity.customer_id == customer.id))
        await db.execute(delete(ChannelConfirmation).where(ChannelConfirmation.customer_id == customer.id))
        await db.execute(update(BusinessCustomer).where(BusinessCustomer.customer_id == customer.id)
                         .values(marketing_opt_in=False, transactional_enabled=False))
        customer.user_id = None
        customer.normalized_phone = "d" + uuid4().hex[:19]
        customer.name = "Deleted customer"
        customer.verified_at = None
        customer.state = "DELETED"
    user.name = None
    user.phone = None
    user.phone_verified_at = None
    user.email = None
    user.google_sub = None
    user.password_hash = None
    user.avatar_url = None
    user.status = "deleted"
    user.is_active = False
    user.role = "user"
    user.last_login = None
    row.status = "completed"
    row.completed_at = datetime.now(timezone.utc)
    row.processed_by = actor
    row.processing_evidence = evidence
    row.retained_records = retained_records
    await db.commit()
    return row
