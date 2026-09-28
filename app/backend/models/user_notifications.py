"""In-app + push notifications for personal cabinet users."""

from models.base import BaseModel
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint


class UserNotification(BaseModel):
    __tablename__ = "user_notifications"
    __table_args__ = (
        UniqueConstraint("user_id", "event_key", name="uq_user_notifications_event"),
        {"extend_existing": True},
    )

    push_status = Column(String(20), nullable=False, default='none', server_default='none', index=True)
    push_claimed_at = Column(DateTime(timezone=True), nullable=True)
    push_attempts = Column(Integer, nullable=False, default=0, server_default='0')
    user_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=False)
    category = Column(String(32), nullable=False, index=True)  # food/taxi/store/logistics/bonus/master
    event_key = Column(String(128), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    path = Column(String(512), nullable=True)
    entity_type = Column(String(64), nullable=True)
    entity_id = Column(String(64), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
