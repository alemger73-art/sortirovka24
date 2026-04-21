from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


class Master_requests(Base):
    __tablename__ = "master_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    category = Column(String, nullable=False)
    problem_description = Column(String, nullable=False)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=False)
    client_name = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)