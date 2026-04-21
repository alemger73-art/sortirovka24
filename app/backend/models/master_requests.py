from core.database import Base
from sqlalchemy import Column, Integer, String


class Master_requests(Base):
    __tablename__ = "master_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    category = Column(String, nullable=True)
    problem_description = Column(String, nullable=True)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    client_name = Column(String, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(String, nullable=True)