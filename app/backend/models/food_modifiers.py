from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Food_modifiers(Base):
    __tablename__ = "food_modifiers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    price = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)
    frontpad_id = Column(String, nullable=True)