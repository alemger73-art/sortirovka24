from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Real_estate(Base):
    __tablename__ = "real_estate"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(255), nullable=True, index=True)
    re_type = Column(String, nullable=True)
    category_id = Column(Integer, nullable=True, index=True)
    title = Column(String, nullable=True)
    description = Column(String, nullable=True)
    price = Column(String, nullable=True)
    address = Column(String, nullable=True)
    rooms = Column(String, nullable=True)
    area = Column(String, nullable=True)
    floor_info = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    gallery_images = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    telegram = Column(String, nullable=True)
    author_name = Column(String, nullable=True)
    active = Column(Boolean, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
    expires_at = Column(String, nullable=True)
    promoted_until = Column(String, nullable=True)
    promotion_tier = Column(String, nullable=True)
    views_count = Column(Integer, nullable=True, default=0)
