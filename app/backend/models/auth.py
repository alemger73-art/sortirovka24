from models.base import Base
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String
from sqlalchemy.sql import func


class User(Base):
    __tablename__ = "users"

    id = Column(String(255), primary_key=True, index=True)  # Use platform sub as primary key
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(32), nullable=True, unique=True, index=True)
    password_hash = Column(String(255), nullable=True)
    name = Column(String(255), nullable=True)
    avatar_url = Column(String(1024), nullable=True)
    language = Column(String(8), nullable=False, default="ru")
    role = Column(String(50), default="user", nullable=False)  # user/master/driver/seller/moderator/admin/superadmin
    status = Column(String(32), default="active", nullable=False)  # active/blocked/deleted
    bonus_balance = Column(Float, nullable=False, default=0)
    agreement_accepted = Column(Boolean, nullable=False, default=False)
    privacy_accepted = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)


class OIDCState(Base):
    __tablename__ = "oidc_states"

    id = Column(Integer, primary_key=True, index=True)
    state = Column(String(255), unique=True, index=True, nullable=False)
    nonce = Column(String(255), nullable=False)
    code_verifier = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
