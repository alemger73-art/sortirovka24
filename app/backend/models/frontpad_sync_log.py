from core.database import Base
from sqlalchemy import Column, Integer, String


class Frontpad_sync_log(Base):
    __tablename__ = "frontpad_sync_log"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    sync_type = Column(String, nullable=False)
    status = Column(String, nullable=False)
    products_synced = Column(Integer, nullable=True)
    categories_synced = Column(Integer, nullable=True)
    errors = Column(String, nullable=True)
    started_at = Column(String, nullable=True)
    completed_at = Column(String, nullable=True)