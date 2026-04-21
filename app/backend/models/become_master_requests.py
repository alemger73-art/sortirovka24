from core.database import Base
from sqlalchemy import Column, Integer, String


class Become_master_requests(Base):
    __tablename__ = "become_master_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=True)
    category = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    description = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)