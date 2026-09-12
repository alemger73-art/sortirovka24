from core.database import Base
from sqlalchemy import Column, Integer, String, Numeric, Boolean

class FoodExpense(Base):
    __tablename__ = 'food_expenses'
    id = Column(String(36), primary_key=True)
    day = Column(String(10), nullable=False, index=True)
    amount = Column(Numeric(14, 2), nullable=False)
    category = Column(String(30), nullable=False)
    note = Column(String(1000), nullable=False)
    actor = Column(String(200), nullable=False)
    created_at = Column(String, nullable=False)
    voided = Column(Boolean, nullable=False, default=False)
    void_reason = Column(String(500), nullable=True)

class FoodRefund(Base):
    __tablename__ = 'food_refunds'
    order_id = Column(Integer, primary_key=True)
    amount = Column(Numeric(14, 2), nullable=False)
    day = Column(String(10), nullable=False, index=True)
    actor = Column(String(200), nullable=False)
    note = Column(String(1000), nullable=False)
    created_at = Column(String, nullable=False)
