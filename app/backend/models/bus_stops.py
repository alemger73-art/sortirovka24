from core.database import Base
from sqlalchemy import Column, Float, Integer, String


class Bus_stops(Base):
    __tablename__ = "bus_stops"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    route_id = Column(Integer, nullable=True)
    stop_name = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    stop_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)