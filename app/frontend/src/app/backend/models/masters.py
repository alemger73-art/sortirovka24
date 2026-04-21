from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Masters(Base):
    __tablename__ = "masters"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    whatsapp = Column(String, nullable=True)
    district = Column(String, nullable=True)
    description = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    reviews_count = Column(Integer, nullable=True)
    photo_url = Column(String, nullable=True)
    verified = Column(Boolean, nullable=True)
    available_today = Column(Boolean, nullable=True)
    services = Column(String, nullable=True)
    experience_years = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)