from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Modifier_options(Base):
    __tablename__ = "modifier_options"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    group_id = Column(Integer, nullable=True)
    name = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    sort_order = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)