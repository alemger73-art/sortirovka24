from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Bus_notifications(Base):
    __tablename__ = "bus_notifications"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    route_id = Column(Integer, nullable=True)
    title = Column(String, nullable=True)
    message = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)