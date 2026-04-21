from core.database import Base
from sqlalchemy import Column, Integer, String


class Complaints(Base):
    __tablename__ = "complaints"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    category = Column(String, nullable=True)
    address = Column(String, nullable=True)
    description = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    gallery_images = Column(String, nullable=True)
    complaint_video = Column(String, nullable=True)
    author_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)