"""Append-only courier money, controlled handovers, and delivery exceptions."""
from core.database import Base
from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, CheckConstraint, func


class CourierLedger(Base):
    __tablename__ = 'courier_ledger'
    __table_args__ = (
        CheckConstraint("event_type IN ('cash_collected','cash_handed_over','cash_adjustment','earning','payout')", name='ck_courier_ledger_type'),
        CheckConstraint("amount >= 0 OR event_type = 'cash_adjustment'", name='ck_courier_ledger_amount'),
    )
    id = Column(Integer, primary_key=True)
    entry_key = Column(String(160), unique=True, nullable=False)
    courier_id = Column(String(255), ForeignKey('users.id'), nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey('food_shifts.id'), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey('logistics_tasks.id'), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey('food_orders.id'), nullable=True)
    event_type = Column(String(32), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    actor = Column(String(255), nullable=False)
    actor_id = Column(String(255), nullable=False)
    comment = Column(String(1000), nullable=False, default='')
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CourierCashHandover(Base):
    __tablename__ = 'courier_cash_handovers'
    id = Column(Integer, primary_key=True)
    courier_id = Column(String(255), ForeignKey('users.id'), nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey('food_shifts.id'), nullable=False)
    # At most one pending request per courier; clear on confirmation.
    active_key = Column(String(255), nullable=True, unique=True)
    amount = Column(Numeric(14, 2), nullable=False)
    status = Column(String(20), nullable=False, default='pending')
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    confirmed_by = Column(String(255), nullable=True)


class CourierDeliveryIssue(Base):
    __tablename__ = 'courier_delivery_issues'
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey('logistics_tasks.id'), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey('food_orders.id'), nullable=False, index=True)
    courier_id = Column(String(255), ForeignKey('users.id'), nullable=False)
    shift_id = Column(Integer, ForeignKey('food_shifts.id'), nullable=False)
    active_key = Column(String(100), nullable=True, unique=True)
    reason = Column(String(32), nullable=False)
    comment = Column(String(1000), nullable=False, default='')
    status = Column(String(20), nullable=False, default='open')
    resolution = Column(String(1000), nullable=True)
    resolved_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
