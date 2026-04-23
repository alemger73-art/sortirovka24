from models.base import Base
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=False)
    token_jti = Column(String(128), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserAction(Base):
    __tablename__ = "user_actions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=True)
    action = Column(String(128), nullable=False)
    entity = Column(String(64), nullable=True)
    entity_id = Column(String(64), nullable=True)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Bonus(Base):
    __tablename__ = "bonuses"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=False)
    points = Column(Float, nullable=False, default=0)
    reason = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True, nullable=False)
    order_type = Column(String(64), nullable=True)
    status = Column(String(32), nullable=True)
    amount = Column(Float, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PhoneVerification(Base):
    __tablename__ = "phone_verifications"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    phone = Column(String(32), index=True, nullable=False)
    code_hash = Column(String(128), nullable=False)
    is_verified = Column(Boolean, nullable=False, default=False)
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
