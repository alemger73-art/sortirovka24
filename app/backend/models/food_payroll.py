from core.database import Base
from sqlalchemy import Column, Integer, String, Float, Text, Boolean

class FoodPayrollEmployee(Base):
    __tablename__ = 'food_payroll_employees'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    position = Column(String(150), nullable=False)
    daily_base = Column(Float, nullable=False, default=0)
    percent = Column(Float, nullable=False, default=0)
    basis = Column(String(20), nullable=False, default='kitchen')
    active = Column(Boolean, nullable=False, default=True)

class FoodPayrollDay(Base):
    __tablename__ = 'food_payroll_days'
    day = Column(String(10), primary_key=True)
    version = Column(Integer, nullable=False, default=0)
    closed_json = Column(Text, nullable=True)
    closed_at = Column(String, nullable=True)

class FoodPayrollWork(Base):
    __tablename__ = 'food_payroll_work'
    id = Column(String(50), primary_key=True)
    day = Column(String(10), nullable=False, index=True)
    employee_id = Column(Integer, nullable=False)
    daily_base = Column(Float, nullable=False)
    percent = Column(Float, nullable=False)
    basis = Column(String(20), nullable=False)

class FoodPayrollPayment(Base):
    __tablename__ = 'food_payroll_payments'
    id = Column(String(36), primary_key=True)
    day = Column(String(10), nullable=False, index=True)
    employee_id = Column(Integer, nullable=False)
    amount = Column(Float, nullable=False)
    note = Column(String(500), nullable=False)
    created_at = Column(String, nullable=False)
    actor = Column(String(200), nullable=False)
    voided = Column(Boolean, nullable=True, default=False)
    void_reason = Column(String(700), nullable=True)
