from core.database import Base
from sqlalchemy import Column, Integer, String, Text


class SupportSettings(Base):
    __tablename__ = "support_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    key = Column(String(64), nullable=False, unique=True, index=True)
    value = Column(Text, nullable=True)
