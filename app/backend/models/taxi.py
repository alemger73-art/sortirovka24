from core.database import Base
from models.base import BaseModel
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text


class TaxiSettings(Base):
    __tablename__ = "taxi_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    key = Column(String(64), nullable=False, unique=True, index=True)
    value = Column(Text, nullable=True)


class TaxiDriverProfile(Base):
    __tablename__ = "taxi_driver_profiles"
    __table_args__ = {"extend_existing": True}

    user_id = Column(String(255), ForeignKey("users.id"), primary_key=True, index=True, nullable=False)
    is_online = Column(Boolean, nullable=False, default=False)
    is_verified = Column(Boolean, nullable=False, default=False)
    car_make = Column(String(64), nullable=True)
    car_model = Column(String(64), nullable=True)
    car_number = Column(String(32), nullable=True)
    car_color = Column(String(32), nullable=True)
    rating = Column(Float, nullable=False, default=5.0)
    rides_count = Column(Integer, nullable=False, default=0)
    balance = Column(Float, nullable=False, default=0)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    phone = Column(String(32), nullable=True)


class TaxiRide(BaseModel):
    __tablename__ = "taxi_rides"
    __table_args__ = {"extend_existing": True}

    user_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=False)
    driver_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=True)

    passenger_name = Column(String(255), nullable=True)
    passenger_phone = Column(String(32), nullable=True)

    from_address = Column(String(512), nullable=False)
    to_address = Column(String(512), nullable=False)
    from_lat = Column(Float, nullable=True)
    from_lng = Column(Float, nullable=True)
    to_lat = Column(Float, nullable=True)
    to_lng = Column(Float, nullable=True)

    distance_km = Column(Float, nullable=True)
    estimated_price = Column(Float, nullable=False, default=0)
    final_price = Column(Float, nullable=True)

    status = Column(String(32), nullable=False, default="pending", index=True)
    payment_method = Column(String(32), nullable=False, default="cash")
    comment = Column(Text, nullable=True)

    cancel_reason = Column(String(512), nullable=True)
    cancelled_by = Column(String(32), nullable=True)  # passenger/driver/admin

    accepted_at = Column(String(64), nullable=True)
    arrived_at = Column(String(64), nullable=True)
    started_at = Column(String(64), nullable=True)
    completed_at = Column(String(64), nullable=True)
    cancelled_at = Column(String(64), nullable=True)

    rating = Column(Integer, nullable=True)
    rating_comment = Column(Text, nullable=True)
