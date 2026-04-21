from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


class Questions(Base):
    __tablename__ = "questions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    question_text = Column(String, nullable=False)
    author_name = Column(String, nullable=True)
    answers_count = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)