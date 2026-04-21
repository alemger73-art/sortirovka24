from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Banners(Base):
    __tablename__ = "banners"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    banner_title = Column(String, nullable=False)
    banner_text = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    link_url = Column(String, nullable=True)
    banner_type = Column(String, nullable=False)
    active = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)