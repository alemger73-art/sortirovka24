from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Food_settings(Base):
    __tablename__ = "food_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    setting_key = Column(String, nullable=True)
    setting_value = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True)