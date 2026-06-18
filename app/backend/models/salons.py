from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Salons(Base):
    __tablename__ = "salons"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    category = Column(String, nullable=True)
    address = Column(String, nullable=True)
    district = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    instagram = Column(String, nullable=True)
    description = Column(String, nullable=True)
    services = Column(String, nullable=True)
    working_hours = Column(String, nullable=True)
    price_from = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    gallery_images = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    reviews_count = Column(Integer, nullable=True)
    verified = Column(Boolean, nullable=True)
    featured = Column(Boolean, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)
