"""Compute operational admin summary (pending counts + recent items)."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.announcements import Announcements
from models.become_master_requests import Become_master_requests
from models.business_partner_requests import Business_partner_requests
from models.complaints import Complaints
from models.food_orders import Food_orders
from models.jobs import Jobs
from models.logistics import CourierApplication
from models.master_requests import Master_requests
from models.park_orders import Park_orders
from models.real_estate import Real_estate
from models.taxi import TaxiDriverApplication


class AdminRecentItem(BaseModel):
    type: str
    id: int
    title: str
    subtitle: str = ""
    tab: str
    created_at: str | None = None


class AdminSummaryResponse(BaseModel):
    master_requests_new: int = 0
    become_master_pending: int = 0
    announcements_pending: int = 0
    complaints_new: int = 0
    real_estate_pending: int = 0
    jobs_pending: int = 0
    food_orders_new: int = 0
    park_orders_active: int = 0
    taxi_applications_pending: int = 0
    courier_applications_pending: int = 0
    business_partner_new: int = 0
    total_pending: int = 0
    updated_at: str = ""
    recent: list[AdminRecentItem] = Field(default_factory=list)


async def _count(db: AsyncSession, model, *conditions) -> int:
    stmt = select(func.count()).select_from(model)
    if conditions:
        stmt = stmt.where(*conditions)
    return int((await db.execute(stmt)).scalar() or 0)


def _status_eq(column, value: str):
    return func.lower(func.coalesce(column, "")) == value


def _status_in(column, values: tuple[str, ...]):
    lowered = [v.lower() for v in values]
    return func.lower(func.coalesce(column, "")).in_(lowered)


async def compute_admin_summary(db: AsyncSession) -> AdminSummaryResponse:
    master_requests_new = await _count(
        db,
        Master_requests,
        or_(Master_requests.status.is_(None), _status_eq(Master_requests.status, "new")),
    )
    become_master_pending = await _count(
        db, Become_master_requests, _status_in(Become_master_requests.status, ("pending",))
    )
    announcements_pending = await _count(
        db, Announcements, _status_in(Announcements.status, ("pending",))
    )
    complaints_new = await _count(
        db,
        Complaints,
        or_(Complaints.status.is_(None), _status_eq(Complaints.status, "new")),
    )
    real_estate_pending = await _count(
        db, Real_estate, _status_in(Real_estate.status, ("pending",))
    )
    jobs_pending = await _count(db, Jobs, _status_in(Jobs.status, ("pending",)))
    food_orders_new = await _count(db, Food_orders, _status_eq(Food_orders.status, "new"))
    park_orders_active = await _count(
        db,
        Park_orders,
        or_(
            Park_orders.status.is_(None),
            ~func.lower(func.coalesce(Park_orders.status, "")).in_(("delivered", "cancelled")),
        ),
    )
    taxi_applications_pending = await _count(
        db, TaxiDriverApplication, _status_eq(TaxiDriverApplication.status, "pending")
    )
    courier_applications_pending = await _count(
        db, CourierApplication, _status_eq(CourierApplication.status, "pending")
    )
    business_partner_new = await _count(
        db,
        Business_partner_requests,
        or_(
            Business_partner_requests.status.is_(None),
            _status_eq(Business_partner_requests.status, "new"),
        ),
    )

    counts = [
        master_requests_new,
        become_master_pending,
        announcements_pending,
        complaints_new,
        real_estate_pending,
        jobs_pending,
        food_orders_new,
        park_orders_active,
        taxi_applications_pending,
        courier_applications_pending,
        business_partner_new,
    ]
    total_pending = sum(counts)

    recent: list[AdminRecentItem] = []

    mr_rows = (
        await db.execute(
            select(Master_requests)
            .where(or_(Master_requests.status.is_(None), _status_eq(Master_requests.status, "new")))
            .order_by(Master_requests.id.desc())
            .limit(5)
        )
    ).scalars().all()
    for row in mr_rows:
        recent.append(
            AdminRecentItem(
                type="master_request",
                id=row.id,
                title=row.category or "Заявка на мастера",
                subtitle=(row.problem_description or "")[:120],
                tab="master-requests",
                created_at=row.created_at,
            )
        )

    bm_rows = (
        await db.execute(
            select(Become_master_requests)
            .where(_status_in(Become_master_requests.status, ("pending",)))
            .order_by(Become_master_requests.id.desc())
            .limit(5)
        )
    ).scalars().all()
    for row in bm_rows:
        recent.append(
            AdminRecentItem(
                type="become_master",
                id=row.id,
                title=row.name or "Заявка мастера",
                subtitle=row.category or "",
                tab="become-master",
                created_at=row.created_at,
            )
        )

    ann_rows = (
        await db.execute(
            select(Announcements)
            .where(_status_in(Announcements.status, ("pending",)))
            .order_by(Announcements.id.desc())
            .limit(5)
        )
    ).scalars().all()
    for row in ann_rows:
        recent.append(
            AdminRecentItem(
                type="announcement",
                id=row.id,
                title=row.title or "Объявление",
                subtitle=row.author_name or row.phone or "",
                tab="announcements",
                created_at=row.created_at,
            )
        )

    comp_rows = (
        await db.execute(
            select(Complaints)
            .where(or_(Complaints.status.is_(None), _status_eq(Complaints.status, "new")))
            .order_by(Complaints.id.desc())
            .limit(5)
        )
    ).scalars().all()
    for row in comp_rows:
        recent.append(
            AdminRecentItem(
                type="complaint",
                id=row.id,
                title=row.category or "Жалоба",
                subtitle=(row.description or "")[:120],
                tab="complaints",
                created_at=row.created_at,
            )
        )

    food_rows = (
        await db.execute(
            select(Food_orders)
            .where(_status_eq(Food_orders.status, "new"))
            .order_by(Food_orders.id.desc())
            .limit(5)
        )
    ).scalars().all()
    for row in food_rows:
        recent.append(
            AdminRecentItem(
                type="food_order",
                id=row.id,
                title=row.restaurant_name or "Заказ еды",
                subtitle=f"{row.customer_name or ''} · {row.total_amount or 0} ₸".strip(),
                tab="dam-alem",
                created_at=row.created_at,
            )
        )

    bp_rows = (
        await db.execute(
            select(Business_partner_requests)
            .where(
                or_(
                    Business_partner_requests.status.is_(None),
                    _status_eq(Business_partner_requests.status, "new"),
                )
            )
            .order_by(Business_partner_requests.id.desc())
            .limit(5)
        )
    ).scalars().all()
    for row in bp_rows:
        recent.append(
            AdminRecentItem(
                type="business_partner",
                id=row.id,
                title=row.name or "Заявка партнёра",
                subtitle=row.activity or "",
                tab="partners-business",
                created_at=row.created_at,
            )
        )

    recent.sort(key=lambda item: item.created_at or "", reverse=True)
    recent = recent[:15]

    return AdminSummaryResponse(
        master_requests_new=master_requests_new,
        become_master_pending=become_master_pending,
        announcements_pending=announcements_pending,
        complaints_new=complaints_new,
        real_estate_pending=real_estate_pending,
        jobs_pending=jobs_pending,
        food_orders_new=food_orders_new,
        park_orders_active=park_orders_active,
        taxi_applications_pending=taxi_applications_pending,
        courier_applications_pending=courier_applications_pending,
        business_partner_new=business_partner_new,
        total_pending=total_pending,
        updated_at=datetime.now(timezone.utc).isoformat(),
        recent=recent,
    )


def summary_fingerprint(summary: AdminSummaryResponse) -> str:
    """Compact change detector — counts only (recent list excluded)."""
    return (
        f"{summary.master_requests_new}|{summary.become_master_pending}|"
        f"{summary.announcements_pending}|{summary.complaints_new}|"
        f"{summary.real_estate_pending}|{summary.jobs_pending}|"
        f"{summary.food_orders_new}|{summary.park_orders_active}|"
        f"{summary.taxi_applications_pending}|{summary.courier_applications_pending}|"
        f"{summary.business_partner_new}"
    )
