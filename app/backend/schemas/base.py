"""Shared Pydantic base schemas with datetime coercion."""
from typing import Any, Optional
from pydantic import BaseModel, field_validator


class TimestampMixin(BaseModel):
    """Mixin that coerces created_at (and similar timestamp fields) to string
    before Pydantic validation. This fixes PostgreSQL returning datetime objects
    with timezone info like '2026-03-15 16:07:16.073+00' that Pydantic v2 can't
    parse as plain strings."""

    created_at: Optional[Any] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def coerce_created_at(cls, v: Any) -> Any:
        if v is not None:
            return str(v)
        return v

    class Config:
        from_attributes = True