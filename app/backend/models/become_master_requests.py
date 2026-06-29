from core.database import Base
from sqlalchemy import Column, Integer, String


class Become_master_requests(Base):
    __tablename__ = "become_master_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(255), nullable=True, index=True)
    name = Column(String, nullable=True)
    category = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    district = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    gallery_images = Column(String, nullable=True)
    description = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)