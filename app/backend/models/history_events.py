from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class History_events(Base):
    __tablename__ = "history_events"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    year = Column(String, nullable=True)
    title = Column(String, nullable=True)
    description = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    image_url_after = Column(String, nullable=True)
    category = Column(String, nullable=True)
    is_published = Column(Boolean, nullable=True)
    created_at = Column(String, nullable=True)