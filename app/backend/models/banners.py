from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Banners(Base):
    __tablename__ = "banners"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    title = Column(String, nullable=True)
    banner_text = Column(String, nullable=True)
    subtitle = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    link_url = Column(String, nullable=True)
    button_text = Column(String, nullable=True)
    button_url = Column(String, nullable=True)
    banner_type = Column(String, nullable=True)
    active = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)