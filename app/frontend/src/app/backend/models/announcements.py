from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Announcements(Base):
    __tablename__ = "announcements"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    ann_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    price = Column(String, nullable=True)
    address = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    phone = Column(String, nullable=False)
    whatsapp = Column(String, nullable=True)
    author_name = Column(String, nullable=True)
    active = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)