"""One shared physical DAM cash drawer; balances are sums of immutable entries."""
from core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, func


class FoodCashEntry(Base):
    __tablename__ = 'food_cash_entries'
    id = Column(String(36), primary_key=True)
    entry_key = Column(String(160), nullable=False, unique=True)
    kind = Column(String(24), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)  # signed physical movement
    recipient = Column(String(200), nullable=False)
    reason = Column(String(1000), nullable=False)
    actor = Column(String(200), nullable=False)
    actor_id = Column(String(255), nullable=False)
    shift_id = Column(Integer, ForeignKey('food_shifts.id'), nullable=True)
    order_id = Column(Integer, ForeignKey('food_orders.id'), nullable=True)
    expense_id = Column(String(36), ForeignKey('food_expenses.id'), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
