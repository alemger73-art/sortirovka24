"""In-app + push notifications for personal cabinet users."""

from models.base import BaseModel
from sqlalchemy import Boolean, Column, ForeignKey, String, Text, UniqueConstraint


class UserNotification(BaseModel):
    __tablename__ = "user_notifications"
    __table_args__ = (
        UniqueConstraint("user_id", "event_key", name="uq_user_notifications_event"),
        {"extend_existing": True},
    )

    user_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=False)
    category = Column(String(32), nullable=False, index=True)  # food/taxi/store/logistics/bonus/master
    event_key = Column(String(128), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    path = Column(String(512), nullable=True)
    entity_type = Column(String(64), nullable=True)
    entity_id = Column(String(64), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
