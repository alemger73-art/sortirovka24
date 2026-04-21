from core.database import Base
from sqlalchemy import Column, Integer


class Food_item_modifiers(Base):
    __tablename__ = "food_item_modifiers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    food_item_id = Column(Integer, nullable=False)
    modifier_id = Column(Integer, nullable=False)