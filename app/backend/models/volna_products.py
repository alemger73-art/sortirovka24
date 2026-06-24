from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Volna_products(Base):
    __tablename__ = "volna_products"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    category_id = Column(Integer, nullable=True)
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    weight = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    is_popular = Column(Boolean, nullable=True, default=False)
    is_active = Column(Boolean, nullable=True, default=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)
