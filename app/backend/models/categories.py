from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Categories(Base):
    __tablename__ = "categories"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    slug = Column(String, nullable=True)
    cat_type = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    description = Column(String, nullable=True)
    parent_id = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=True)
    show_on_main = Column(Boolean, nullable=True)
    is_active = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)