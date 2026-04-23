from core.database import Base
from sqlalchemy import Column, Float, Integer, String


class Food_orders(Base):
    __tablename__ = "food_orders"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(Integer, nullable=True)
    order_items = Column(String, nullable=True)
    total_amount = Column(Float, nullable=True)
    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    delivery_address = Column(String, nullable=True)
    comment = Column(String, nullable=True)
    delivery_method = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)