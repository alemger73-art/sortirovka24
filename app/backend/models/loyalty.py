"""Auxiliary allocation/identity records for the existing bonuses ledger."""
from models.base import Base
from sqlalchemy import Column, Integer, String, Numeric, DateTime, JSON, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy.sql import func


class BonusPolicy(Base):
    __tablename__ = 'bonus_policy'
    id = Column(String(64), ForeignKey('businesses.id'), primary_key=True)
    version = Column(Integer, nullable=False, default=1)
    settings = Column(JSON, nullable=False)


class BonusLot(Base):
    __tablename__ = 'bonus_lots'
    __table_args__ = (CheckConstraint('remaining >= 0', name='ck_bonus_lot_remaining'),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(Integer, ForeignKey('bonuses.id'), nullable=False, unique=True)
    account_id = Column(String(36), ForeignKey('bonus_members.id'), nullable=False, index=True)
    remaining = Column(Numeric(14, 2), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)


class BonusAllocation(Base):
    __tablename__ = 'bonus_allocations'
    id = Column(Integer, primary_key=True, autoincrement=True)
    debit_id = Column(Integer, ForeignKey('bonuses.id'), nullable=False, index=True)
    lot_id = Column(Integer, ForeignKey('bonus_lots.id'), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)


class BonusMember(Base):
    __tablename__ = 'bonus_members'
    __table_args__ = (UniqueConstraint('business_id','customer_id', name='uq_bonus_business_customer'),
        CheckConstraint('bonus_balance >= 0 AND bonus_debt >= 0', name='ck_bonus_account_nonnegative'))
    id = Column(String(36), ForeignKey('business_customers.id'), primary_key=True)
    business_id = Column(String(64), ForeignKey('businesses.id'), nullable=False, index=True)
    customer_id = Column(String(36), ForeignKey('customers.id'), nullable=False, index=True)
    bonus_balance = Column(Numeric(14,2), nullable=False, default=0)
    bonus_debt = Column(Numeric(14,2), nullable=False, default=0)
    enabled = Column(Integer, nullable=False, default=1)
    referral_code = Column(String(48), unique=True, nullable=False)
    welcome_order_id = Column(Integer, nullable=True)
    legacy_welcome = Column(Integer, nullable=False, default=0)
    initialized = Column(Integer, nullable=False, default=0)


class BonusReferral(Base):
    __tablename__ = 'bonus_referrals'
    __table_args__ = (CheckConstraint('referred_id <> referrer_id', name='ck_bonus_no_self_referral'),)
    referred_id = Column(String(255), ForeignKey('bonus_members.id'), primary_key=True)
    referrer_id = Column(String(255), ForeignKey('bonus_members.id'), nullable=False, index=True)
    qualified_order_id = Column(Integer, nullable=True, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BonusReview(Base):
    __tablename__ = 'bonus_reviews'
    id = Column(Integer, primary_key=True, autoincrement=True)
    business_key = Column(String(255), nullable=False, unique=True)
    account_id = Column(String(36), ForeignKey('bonus_members.id'), nullable=False)
    order_id = Column(Integer, nullable=False)
    kind = Column(String(32), nullable=False)
    status = Column(String(20), nullable=False, default='REVIEW')
    reason = Column(String(500), nullable=False)
    details = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
