from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Jobs(Base):
    __tablename__ = "jobs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    job_title = Column(String, nullable=False)
    employer = Column(String, nullable=False)
    salary = Column(String, nullable=True)
    schedule = Column(String, nullable=True)
    district = Column(String, nullable=True)
    description = Column(String, nullable=True)
    phone = Column(String, nullable=False)
    whatsapp = Column(String, nullable=True)
    active = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)