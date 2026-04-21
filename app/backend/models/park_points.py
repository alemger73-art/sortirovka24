from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Park_points(Base):
    __tablename__ = "park_points"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)