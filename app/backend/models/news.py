from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class News(Base):
    __tablename__ = "news"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    title = Column(String, nullable=True)
    content = Column(String, nullable=True)
    short_description = Column(String, nullable=True)
    category = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    gallery_images = Column(String, nullable=True)
    youtube_url = Column(String, nullable=True)
    published = Column(Boolean, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)