from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Bus_routes(Base):
    __tablename__ = "bus_routes"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    route_number = Column(String, nullable=True)
    route_name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    color = Column(String, nullable=True)
    first_departure_weekday = Column(String, nullable=True)
    last_departure_weekday = Column(String, nullable=True)
    interval_weekday = Column(String, nullable=True)
    first_departure_weekend = Column(String, nullable=True)
    last_departure_weekend = Column(String, nullable=True)
    interval_weekend = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)