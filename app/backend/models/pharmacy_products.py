from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Pharmacy_products(Base):
    __tablename__ = "pharmacy_products"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    category_id = Column(Integer, nullable=True)
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    old_price = Column(Float, nullable=True)
    weight = Column(String, nullable=True)  # форма/фасовка: "20 таблеток", "100 мл"
    image_url = Column(String, nullable=True)
    is_popular = Column(Boolean, nullable=True, default=False)
    is_active = Column(Boolean, nullable=True, default=True)
    in_stock = Column(Boolean, nullable=True, default=True)
    requires_prescription = Column(Boolean, nullable=True, default=False)
    manufacturer = Column(String, nullable=True)
    country = Column(String, nullable=True)
    active_ingredient = Column(String, nullable=True)
    dosage_form = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)
