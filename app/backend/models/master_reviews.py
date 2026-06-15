from core.database import Base
from sqlalchemy import Column, Integer, String, UniqueConstraint


class Master_reviews(Base):
    __tablename__ = "master_reviews"
    __table_args__ = (
        UniqueConstraint("master_id", "reviewer_user_id", name="uq_master_reviews_master_reviewer"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    master_id = Column(Integer, index=True, nullable=False)
    reviewer_user_id = Column(String(36), index=True, nullable=False)
    reviewer_name = Column(String, nullable=True)
    rating = Column(Integer, nullable=False)
    comment = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
