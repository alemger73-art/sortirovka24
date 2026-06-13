from core.database import Base
from sqlalchemy import Column, String


class Gastronom_settings(Base):
    __tablename__ = "gastronom_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    key = Column(String, nullable=True, index=True)
    value = Column(String, nullable=True)
