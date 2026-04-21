from core.database import Base
from sqlalchemy import Column, Integer, String


class Item_modifier_groups(Base):
    __tablename__ = "item_modifier_groups"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    food_item_id = Column(Integer, nullable=True)
    modifier_group_id = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)