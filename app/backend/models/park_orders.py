from core.database import Base
from sqlalchemy import Column, Float, Integer, String


class Park_orders(Base):
    __tablename__ = "park_orders"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    point_id = Column(Integer, nullable=True)
    order_items = Column(String, nullable=True)
    total_amount = Column(Float, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)