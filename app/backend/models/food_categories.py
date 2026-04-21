from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Food_categories(Base):
    __tablename__ = "food_categories"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)