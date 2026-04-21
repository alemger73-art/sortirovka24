from core.database import Base
from sqlalchemy import Column, Integer, String


class Directory_entries(Base):
    __tablename__ = "directory_entries"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    entry_name = Column(String, nullable=True)
    category = Column(String, nullable=True)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(String, nullable=True)