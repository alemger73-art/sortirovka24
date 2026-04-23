from models.base import Base
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text


class AccountUser(Base):
    __tablename__ = "account_users"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    phone = Column(String(32), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="user")  # user/master/driver/partner/admin/superadmin
    full_name = Column(String(255), nullable=True)
    avatar_url = Column(String(1024), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    accepted_agreement = Column(Boolean, nullable=False, default=False)
    accepted_privacy = Column(Boolean, nullable=False, default=False)
    accepted_at = Column(String, nullable=True)
    last_login_at = Column(String, nullable=True)


class AccountOrderHistory(Base):
    __tablename__ = "account_order_history"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    order_type = Column(String(32), nullable=True)  # food/shop/service
    status = Column(String(32), nullable=True)
    amount = Column(Float, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(String, nullable=True)


class AccountRideHistory(Base):
    __tablename__ = "account_ride_history"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    driver_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=True)
    from_address = Column(String(255), nullable=True)
    to_address = Column(String(255), nullable=True)
    status = Column(String(32), nullable=True)
    price = Column(Float, nullable=True)
    created_at = Column(String, nullable=True)


class AccountFavorite(Base):
    __tablename__ = "account_favorites"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    entity_type = Column(String(32), nullable=False)  # master/food/announcement/job/news
    entity_id = Column(String(64), nullable=False)
    created_at = Column(String, nullable=True)


class AccountBonus(Base):
    __tablename__ = "account_bonuses"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    points = Column(Integer, nullable=False, default=0)
    reason = Column(String(255), nullable=True)
    created_at = Column(String, nullable=True)


class AccountNotification(Base):
    __tablename__ = "account_notifications"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(String, nullable=True)


class AccountPaymentHistory(Base):
    __tablename__ = "account_payment_history"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(8), nullable=False, default="KZT")
    status = Column(String(32), nullable=True)
    provider = Column(String(64), nullable=True)
    external_id = Column(String(128), nullable=True)
    created_at = Column(String, nullable=True)


class MasterProfile(Base):
    __tablename__ = "master_profiles"
    __table_args__ = {"extend_existing": True}

    user_id = Column(String(36), ForeignKey("account_users.id"), primary_key=True, index=True, nullable=False)
    bio = Column(Text, nullable=True)
    service_categories = Column(String, nullable=True)  # comma-separated for MVP
    work_photos = Column(String, nullable=True)  # comma-separated object keys/urls
    avg_rating = Column(Float, nullable=True, default=0)
    reviews_count = Column(Integer, nullable=True, default=0)


class MasterRequest(Base):
    __tablename__ = "master_requests_v2"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    master_user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    requester_user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=True)
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(32), nullable=True, default="new")
    created_at = Column(String, nullable=True)


class MasterReview(Base):
    __tablename__ = "master_reviews_v2"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    master_user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    reviewer_user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=True)
    rating = Column(Integer, nullable=False, default=5)
    comment = Column(Text, nullable=True)
    created_at = Column(String, nullable=True)


class DriverProfile(Base):
    __tablename__ = "driver_profiles"
    __table_args__ = {"extend_existing": True}

    user_id = Column(String(36), ForeignKey("account_users.id"), primary_key=True, index=True, nullable=False)
    is_online = Column(Boolean, nullable=False, default=False)
    car_make = Column(String(64), nullable=True)
    car_model = Column(String(64), nullable=True)
    car_number = Column(String(32), nullable=True)
    verification_docs = Column(String, nullable=True)  # comma-separated keys
    balance = Column(Float, nullable=False, default=0)


class PartnerProfile(Base):
    __tablename__ = "partner_profiles"
    __table_args__ = {"extend_existing": True}

    user_id = Column(String(36), ForeignKey("account_users.id"), primary_key=True, index=True, nullable=False)
    shop_name = Column(String(255), nullable=True)
    shop_description = Column(Text, nullable=True)
    logo_url = Column(String(1024), nullable=True)
    banner_urls = Column(String, nullable=True)


class PartnerProduct(Base):
    __tablename__ = "partner_products"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    partner_user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=True)
    image_url = Column(String(1024), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)


class PartnerOrder(Base):
    __tablename__ = "partner_orders"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    partner_user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=False)
    customer_user_id = Column(String(36), ForeignKey("account_users.id"), index=True, nullable=True)
    status = Column(String(32), nullable=True)
    total_amount = Column(Float, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(String, nullable=True)


class FeatureToggle(Base):
    __tablename__ = "feature_toggles"
    __table_args__ = {"extend_existing": True}

    key = Column(String(128), primary_key=True, index=True, nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)
    description = Column(String(255), nullable=True)
    updated_by = Column(String(36), nullable=True)
    updated_at = Column(String, nullable=True)


class AccountAuditLog(Base):
    __tablename__ = "account_audit_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    actor_user_id = Column(String(36), nullable=True)
    action = Column(String(128), nullable=False)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(64), nullable=True)
    meta = Column(Text, nullable=True)
    created_at = Column(String, nullable=True)
