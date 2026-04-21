from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Announcements(Base):
    __tablename__ = "announcements"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    ann_type = Column(String, nullable=True)
    title = Column(String, nullable=True)
    description = Column(String, nullable=True)
    price = Column(String, nullable=True)
    address = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    gallery_images = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    telegram = Column(String, nullable=True)
    author_name = Column(String, nullable=True)
    active = Column(Boolean, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)