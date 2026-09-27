"""Editorial company pages; separate from employee accounts and applications."""
from sqlalchemy import Boolean, Column, DateTime, JSON, String
from core.database import Base


class PartnerShowcase(Base):
    __tablename__ = "business_showcases"
    slug = Column(String(80), primary_key=True)
    content = Column(JSON, nullable=False)
    published = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)
