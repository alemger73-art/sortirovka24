from core.database import Base
from sqlalchemy import Column, Integer


class Health_check(Base):
    __tablename__ = "health_check"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)