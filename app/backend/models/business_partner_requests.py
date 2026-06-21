from core.database import Base
from sqlalchemy import Column, Integer, String


class Business_partner_requests(Base):
    __tablename__ = "business_partner_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    whatsapp = Column(String, nullable=True)
    activity = Column(String, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, nullable=True, default="new")
    created_at = Column(String, nullable=True)
