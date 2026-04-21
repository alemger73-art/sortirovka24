from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Modifier_groups(Base):
    __tablename__ = "modifier_groups"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    type = Column(String, nullable=True)
    is_required = Column(Boolean, nullable=True)
    min_select = Column(Integer, nullable=True)
    max_select = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)