from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Jobs(Base):
    __tablename__ = "jobs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    job_title = Column(String, nullable=True)
    employer = Column(String, nullable=True)
    category = Column(String, nullable=True)
    description = Column(String, nullable=True)
    salary = Column(String, nullable=True)
    schedule = Column(String, nullable=True)
    district = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    telegram = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    active = Column(Boolean, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)