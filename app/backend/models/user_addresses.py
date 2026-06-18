from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func


class UserAddress(Base):
    """A delivery address saved by an account user.

    Users can keep several permanent addresses and pick which one to deliver to.
    """

    __tablename__ = "user_addresses"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), nullable=False, index=True)
    label = Column(String(120), nullable=True)
    address = Column(String(500), nullable=False)
    comment = Column(Text, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
