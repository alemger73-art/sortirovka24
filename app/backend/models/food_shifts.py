"""Employee shifts and an immutable operational audit trail for DAM ALEM."""

from core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, func


class FoodShift(Base):
    __tablename__ = "food_shifts"
    __table_args__ = (
        Index("ix_food_shifts_staff", "staff_type", "staff_id"),
        Index("ix_food_shifts_opened_at", "opened_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_type = Column(String(20), nullable=False)  # partner | courier
    staff_id = Column(String(255), nullable=False)
    staff_name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    # A nullable unique key is held only while the shift is open. It prevents
    # duplicate openings even when two requests arrive at the same time.
    active_key = Column(String(300), nullable=True, unique=True)
    opened_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)
    opened_by = Column(String(255), nullable=False)
    closed_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FoodStaffAction(Base):
    __tablename__ = "food_staff_actions"
    __table_args__ = (
        Index("ix_food_staff_actions_staff", "staff_type", "staff_id"),
        Index("ix_food_staff_actions_created", "created_at"),
        Index("ix_food_staff_actions_entity", "entity_type", "entity_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    shift_id = Column(Integer, ForeignKey("food_shifts.id"), nullable=True, index=True)
    staff_type = Column(String(20), nullable=False)
    staff_id = Column(String(255), nullable=False)
    staff_name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    action = Column(String(80), nullable=False)
    entity_type = Column(String(40), nullable=True)
    entity_id = Column(String(255), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
