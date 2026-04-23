from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

RoleType = Literal["user", "master", "driver", "partner", "admin", "superadmin"]


class RegisterRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = None
    role: RoleType = "user"
    accepted_agreement: bool
    accepted_privacy: bool

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        digits = "".join(ch for ch in v if ch.isdigit() or ch == "+")
        return digits.strip()

    @field_validator("accepted_privacy", "accepted_agreement")
    @classmethod
    def must_accept_docs(cls, v: bool):
        if not v:
            raise ValueError("Legal acceptance is required")
        return v


class LoginRequest(BaseModel):
    identifier: str  # phone or email
    password: str


class AuthTokenResponse(BaseModel):
    token: str
    user_id: str
    role: RoleType


class AccountProfileResponse(BaseModel):
    id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None
    role: RoleType
    avatar_url: Optional[str] = None
    is_active: bool
    accepted_agreement: bool
    accepted_privacy: bool
    accepted_at: Optional[str] = None
    last_login_at: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


class CreateFavoriteRequest(BaseModel):
    entity_type: str
    entity_id: str


class FeatureToggleRequest(BaseModel):
    key: str
    enabled: bool
    description: Optional[str] = None


class UserRoleUpdateRequest(BaseModel):
    role: RoleType
    is_active: Optional[bool] = None


class GenericRow(BaseModel):
    id: str
    title: str
    subtitle: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None


class CabinetResponse(BaseModel):
    profile: AccountProfileResponse
    orders_history: List[GenericRow]
    rides_history: List[GenericRow]
    announcements: List[GenericRow]
    complaints: List[GenericRow]
    favorites: List[GenericRow]
    bonuses: List[GenericRow]
    notifications: List[GenericRow]
    payment_history: List[GenericRow]
