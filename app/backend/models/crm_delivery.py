"""Durable CRM delivery state; IDs also reserve immutable spreadsheet row numbers."""
from core.database import Base
from sqlalchemy import Column, Integer, String, JSON, Boolean, Float, UniqueConstraint, Index


class CrmDelivery(Base):
    __tablename__ = "crm_deliveries"
    __table_args__ = (UniqueConstraint("source", "source_id", name="uq_crm_source"),
                      Index("ix_crm_ready", "telegram_done", "dead", "next_attempt_at"))
    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(32), nullable=False)
    source_id = Column(Integer, nullable=False)
    payload = Column(JSON, nullable=False)
    sheets_done = Column(Boolean, nullable=False, default=False)
    telegram_done = Column(Boolean, nullable=False, default=False)
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(Float, nullable=False, default=0)
    dead = Column(Boolean, nullable=False, default=False)
    last_error = Column(String(80), nullable=True)


class FeedbackRequest(Base):
    __tablename__ = "feedback_requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    description = Column(String, nullable=False)
    section = Column(String, nullable=True)
    contact_name = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    page_url = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    screenshot_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="new")
    created_at = Column(String, nullable=False)
