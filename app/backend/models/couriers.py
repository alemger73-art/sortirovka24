from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Couriers(Base):
    __tablename__ = "couriers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True)
    pin_code = Column(String, nullable=True)
    created_at = Column(String, nullable=True)