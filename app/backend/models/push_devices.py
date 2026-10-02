from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, String, Text, JSON, func


class PushDevice(Base):
    __tablename__ = "push_devices"

    id = Column(String(64), primary_key=True)
    token = Column(Text, nullable=False, unique=True, index=True)
    platform = Column(String(16), nullable=False)  # android | ios | web
    user_id = Column(String(255), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    browser = Column(String(24), nullable=True)
    device_platform = Column(String(24), nullable=True)
    preferences = Column(JSON, nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
