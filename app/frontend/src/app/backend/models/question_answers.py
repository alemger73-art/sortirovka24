from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


class Question_answers(Base):
    __tablename__ = "question_answers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    question_id = Column(Integer, nullable=False)
    answer_text = Column(String, nullable=False)
    author_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)