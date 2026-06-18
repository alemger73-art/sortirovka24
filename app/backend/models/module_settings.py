from core.database import Base
from sqlalchemy import Column, Integer, String, Text


class ModuleSettings(Base):
    """On/off flags for whole app modules (admin kill-switch).

    One row per module: key = module slug, value = "true" / "false".
    """

    __tablename__ = "module_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    key = Column(String(64), nullable=False, unique=True, index=True)
    value = Column(Text, nullable=True)
