"""Durable deletion requests. Completion is separate from accepting a request."""
from uuid import uuid4

from core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, JSON, String, Text, func


class AccountDeletionRequest(Base):
    __tablename__ = "account_deletion_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), ForeignKey("users.id"), nullable=False, unique=True)
    status = Column(String(24), nullable=False, default="pending", index=True)
    requested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    due_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    processed_by = Column(String(255), nullable=True)
    # No password, OTP, phone, email or copy of the user's profile is stored here.
    processing_evidence = Column(Text, nullable=True)
    retained_records = Column(JSON, nullable=True)
