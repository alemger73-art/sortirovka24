"""Platform identities; all business information belongs to a membership."""
import uuid
from models.base import Base
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint, Numeric, JSON, Text, Index
from sqlalchemy.sql import func

def uid(): return str(uuid.uuid4())

class Business(Base):
    __tablename__ = 'businesses'
    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False, unique=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Customer(Base):
    __tablename__ = 'customers'
    id = Column(String(36), primary_key=True, default=uid)
    normalized_phone = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    user_id = Column(String(255), ForeignKey('users.id'), unique=True, nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    state = Column(String(20), nullable=False, default='NORMAL')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def phone(self): return self.normalized_phone

class CustomerIdentity(Base):
    __tablename__ = 'customer_identities'
    normalized_phone = Column(String(20), primary_key=True)
    customer_id = Column(String(36), ForeignKey('customers.id'), nullable=False, index=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

class BusinessCustomer(Base):
    __tablename__ = 'business_customers'
    __table_args__ = (UniqueConstraint('business_id','customer_id',name='uq_business_customer'),)
    id = Column(String(36), primary_key=True, default=uid)
    business_id = Column(String(64), ForeignKey('businesses.id'), nullable=False, index=True)
    customer_id = Column(String(36), ForeignKey('customers.id'), nullable=False, index=True)
    first_source = Column(String(20), nullable=False)
    first_seen_at = Column(DateTime(timezone=True), server_default=func.now())
    marketing_opt_in = Column(Boolean, nullable=False, default=False)
    transactional_enabled = Column(Boolean, nullable=False, default=True)

class CustomerNote(Base):
    __tablename__ = 'customer_notes'
    id = Column(Integer, primary_key=True)
    membership_id = Column(String(36), ForeignKey('business_customers.id'), nullable=False, index=True)
    text = Column(Text, nullable=False)
    author = Column(String(255), nullable=False)
    actor_role = Column(String(40), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class BusinessLocation(Base):
    __tablename__ = 'business_locations'
    id = Column(String(100), primary_key=True)
    business_id = Column(String(64), ForeignKey('businesses.id'), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=False)
    landmark = Column(String(500), nullable=False, default='')
    photo = Column(Text, nullable=True)
    latitude = Column(Numeric(10,7), nullable=True)
    longitude = Column(Numeric(10,7), nullable=True)
    supports_pickup = Column(Boolean, nullable=False, default=True)
    supports_delivery = Column(Boolean, nullable=False, default=True)
    active = Column(Boolean, nullable=False, default=True)

class CustomerMigrationIssue(Base):
    __tablename__ = 'customer_migration_issues'
    id = Column(Integer, primary_key=True)
    kind = Column(String(50), nullable=False)
    details = Column(JSON, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

class ChannelConfirmation(Base):
    __tablename__ = 'channel_confirmations'
    id = Column(String(64), primary_key=True)
    business_id = Column(String(64), ForeignKey('businesses.id'), nullable=False)
    customer_id = Column(String(36), ForeignKey('customers.id'), nullable=False)
    message_key = Column(String(255), nullable=False, unique=True)
    quote_hash = Column(String(64), nullable=False)
    payload = Column(JSON, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    order_id = Column(Integer, ForeignKey('food_orders.id'), nullable=True)
