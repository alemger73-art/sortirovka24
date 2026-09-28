"""Payment attempts; the existing food_order_events remains the money ledger."""
from core.database import Base
from sqlalchemy import Column, ForeignKey, Integer, String, Numeric, JSON, UniqueConstraint


class FoodPayment(Base):
    __tablename__ = 'food_payments'
    id = Column(String(36), primary_key=True)
    order_id = Column(Integer, ForeignKey('food_orders.id'), nullable=False, index=True)
    user_id = Column(String(255), nullable=True)
    provider = Column(String(20), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    currency = Column(String(3), nullable=False, default='KZT')
    status = Column(String(20), nullable=False)
    external_id = Column(String(255), nullable=True)
    created_at = Column(String(40), nullable=False)
    paid_at = Column(String(40))
    failed_at = Column(String(40))
    expired_at = Column(String(40))
    refunded_at = Column(String(40))
    metadata_json = Column('metadata', JSON, nullable=False, default=dict)
    __table_args__ = (UniqueConstraint('provider', 'external_id', name='uq_food_payment_external'),)


class FoodPaymentCallback(Base):
    __tablename__ = 'food_payment_callbacks'
    # A provider event can only be applied once, in the same transaction as money.
    key = Column(String(255), primary_key=True)
    payment_id = Column(String(36), ForeignKey('food_payments.id'), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    created_at = Column(String(40), nullable=False)
