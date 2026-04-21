from core.database import Base
from sqlalchemy import Boolean, Column, Integer, String


class Homepage_stats(Base):
    __tablename__ = "homepage_stats"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    masters_count = Column(Integer, nullable=True)
    ads_count = Column(Integer, nullable=True)
    cafes_count = Column(Integer, nullable=True)
    is_auto = Column(Boolean, nullable=True)
    updated_at = Column(String, nullable=True)