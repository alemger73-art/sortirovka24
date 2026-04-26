from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Food_restaurants(Base):
    __tablename__ = "food_restaurants"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    photo = Column(String, nullable=True)
    description = Column(String, nullable=True)
    whatsapp_phone = Column(String, nullable=True)
    working_hours = Column(String, nullable=True)
    min_order = Column(Float, nullable=True)
    delivery_time = Column(String, nullable=True)
    cuisine_type = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)
