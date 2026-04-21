from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class News(Base):
    __tablename__ = "news"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)
    short_description = Column(String, nullable=True)
    category = Column(String, nullable=False)
    image_url = Column(String, nullable=True)
    youtube_url = Column(String, nullable=True)
    published = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)