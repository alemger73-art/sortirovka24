from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


class Complaints(Base):
    __tablename__ = "complaints"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    category = Column(String, nullable=False)
    address = Column(String, nullable=False)
    description = Column(String, nullable=False)
    photo_url = Column(String, nullable=True)
    author_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)