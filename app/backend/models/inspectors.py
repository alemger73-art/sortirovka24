from core.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, String


class Inspectors(Base):
    __tablename__ = "inspectors"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    full_name = Column(String, nullable=True)
    position = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    precinct_number = Column(String, nullable=True)
    district = Column(String, nullable=True)
    address = Column(String, nullable=True)
    schedule = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    streets = Column(String, nullable=True)
    description = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    boundary_coords = Column(String, nullable=True)
    is_leadership = Column(Boolean, nullable=True)
    leadership_order = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)