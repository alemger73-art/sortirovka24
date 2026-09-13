from core.database import Base
from sqlalchemy import Column, Integer, String, Text, Boolean, Float


class FoodOperationsSettings(Base):
    __tablename__ = 'food_operations_settings'
    id = Column(Integer, primary_key=True)
    token_cipher = Column(Text, nullable=True)
    chat_id = Column(String, nullable=True)
    enabled = Column(Boolean, default=False)
    status_updates = Column(Boolean, default=True)
    updated_at = Column(String, nullable=True)


class FoodOrderEvent(Base):
    __tablename__ = 'food_order_events'
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, index=True, nullable=False)
    actor = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(String, nullable=False)
    notification = Column(String, nullable=False, default='pending')
    attempts = Column(Integer, nullable=False, default=0)
    retry_at = Column(Float, nullable=False, default=0)
    claimed_at = Column(Float, nullable=True)
    error = Column(String, nullable=True)
    telegram_message_id = Column(Integer, nullable=True)
    public_data = Column(Text, nullable=True)


class FoodOrderRequest(Base):
    __tablename__ = 'food_order_requests'
    key = Column(String(100), primary_key=True)
    order_id = Column(Integer, nullable=False)
