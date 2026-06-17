"""Unified delivery logistics — tasks, couriers, settings."""

from core.database import Base
from models.base import BaseModel
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text


class LogisticsSettings(Base):
    __tablename__ = "logistics_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    key = Column(String(64), nullable=False, unique=True, index=True)
    value = Column(Text, nullable=True)


class CourierProfile(Base):
    __tablename__ = "courier_profiles"
    __table_args__ = {"extend_existing": True}

    user_id = Column(String(255), ForeignKey("users.id"), primary_key=True, index=True, nullable=False)
    is_online = Column(Boolean, nullable=False, default=False)
    is_verified = Column(Boolean, nullable=False, default=False)
    vehicle_type = Column(String(32), nullable=False, default="bike")  # bike, car, foot
    rating = Column(Float, nullable=False, default=5.0)
    deliveries_count = Column(Integer, nullable=False, default=0)
    balance = Column(Float, nullable=False, default=0)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    location_updated_at = Column(String(64), nullable=True)
    phone = Column(String(32), nullable=True)
    photo_url = Column(String(512), nullable=True)


class LogisticsTask(BaseModel):
    __tablename__ = "logistics_tasks"
    __table_args__ = {"extend_existing": True}

    vertical = Column(String(32), nullable=False, default="food", index=True)
    source_type = Column(String(64), nullable=False, index=True)
    source_id = Column(Integer, nullable=False, index=True)

    status = Column(String(32), nullable=False, default="pending", index=True)

    pickup_address = Column(String(512), nullable=False)
    pickup_lat = Column(Float, nullable=True)
    pickup_lng = Column(Float, nullable=True)
    dropoff_address = Column(String(512), nullable=False)
    dropoff_lat = Column(Float, nullable=True)
    dropoff_lng = Column(Float, nullable=True)

    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(32), nullable=True)
    merchant_name = Column(String(255), nullable=True)

    prep_minutes = Column(Integer, nullable=False, default=20)
    ready_at = Column(String(64), nullable=True)

    courier_id = Column(String(255), ForeignKey("users.id"), nullable=True, index=True)
    offered_courier_id = Column(String(255), nullable=True, index=True)
    offer_expires_at = Column(String(64), nullable=True)
    dispatch_round = Column(Integer, nullable=False, default=0)
    dispatch_excluded = Column(Text, nullable=True)

    total_amount = Column(Float, nullable=True)
    delivery_fee = Column(Float, nullable=True)
    comment = Column(Text, nullable=True)

    picked_up_at = Column(String(64), nullable=True)
    delivered_at = Column(String(64), nullable=True)
    cancelled_at = Column(String(64), nullable=True)
    cancel_reason = Column(String(512), nullable=True)
