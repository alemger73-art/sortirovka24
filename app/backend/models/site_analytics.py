"""Own site analytics and error log. Anonymous: a random visitor id, no names or phones."""

from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text


class SiteEvent(Base):
    __tablename__ = "site_events"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)
    visitor = Column(String(40), nullable=False, index=True)
    session = Column(String(40), nullable=False)
    logged_in = Column(Boolean, nullable=False, default=False)
    kind = Column(String(40), nullable=False, index=True)
    path = Column(String(300), nullable=True)
    referrer = Column(String(120), nullable=True)   # host only, e.g. instagram.com
    device = Column(String(12), nullable=True)      # mobile / tablet / desktop
    platform = Column(String(12), nullable=True)    # android / ios / windows / mac / other
    browser = Column(String(16), nullable=True)
    standalone = Column(Boolean, nullable=False, default=False)  # opened as installed app
    props = Column(Text, nullable=True)             # small JSON: dish, query, step…


class SiteError(Base):
    """One row per distinct error (fingerprint); repeats only raise the counter."""

    __tablename__ = "site_errors"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    fingerprint = Column(String(64), nullable=False, unique=True, index=True)
    source = Column(String(10), nullable=False)      # client / server
    message = Column(Text, nullable=False)
    stack = Column(Text, nullable=True)
    path = Column(String(300), nullable=True)
    browser = Column(String(60), nullable=True)
    release = Column(String(40), nullable=True)
    count = Column(Integer, nullable=False, default=1)
    visitors = Column(Text, nullable=True)            # JSON list (≤50) of affected visitor ids
    first_seen = Column(DateTime(timezone=True), nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(12), nullable=False, default="new")  # new / known / fixed
    notified = Column(Boolean, nullable=False, default=False)
    note = Column(Text, nullable=True)
