from core.database import Base
from sqlalchemy import Column, Integer, String


class Frontpad_settings(Base):
    __tablename__ = "frontpad_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    setting_key = Column(String, nullable=False)
    setting_value = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)