from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Food_items(Base):
    __tablename__ = "food_items"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    restaurant_id = Column(Integer, nullable=True)
    category_id = Column(Integer, nullable=True)
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    image_url = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True)
    is_recommended = Column(Boolean, nullable=True)
    is_popular = Column(Boolean, nullable=True)
    is_combo = Column(Boolean, nullable=True)
    available_in_park = Column(Boolean, nullable=True)
    available = Column(Boolean, nullable=True)
    weight = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)