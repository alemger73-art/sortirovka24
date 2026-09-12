from core.database import Base
from sqlalchemy import Column, Integer, Text

class InspectorDirectory(Base):
    __tablename__ = 'inspector_directory'
    id = Column(Integer, primary_key=True)
    payload = Column(Text, nullable=False)
    revision = Column(Integer, nullable=False, default=1)
