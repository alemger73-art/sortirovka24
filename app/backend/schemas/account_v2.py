from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

RoleType = Literal["user", "master", "driver", "seller", "moderator", "admin", "superadmin"]


class RegisterV2Request(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=5, max_length=32)
    email: Optional[EmailStr] = None
    password: str = Field(min_length=8, max_length=128)
    avatar: Optional[str] = None
    language: Literal["ru", "kz"] = "ru"
    agreement_accepted: bool
    privacy_accepted: bool


class LoginV2Request(BaseModel):
    phone: str
    password: str


class AuthV2Response(BaseModel):
    token: str
    user_id: str
    role: RoleType


class UserV2Response(BaseModel):
    id: str
    name: str
    phone: str
    email: Optional[str] = None
    role: RoleType
    status: str
    avatar: Optional[str] = None
    language: str
    bonus_balance: float
    created_at: Optional[str] = None


class UserV2UpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar: Optional[str] = None
    language: Optional[Literal["ru", "kz"]] = None


class AdminUserUpdateRequest(BaseModel):
    role: Optional[RoleType] = None
    status: Optional[Literal["active", "blocked", "deleted"]] = None
    bonus_delta: Optional[float] = None


class DashboardStatsResponse(BaseModel):
    total_users: int
    new_users_today: int
    active_users: int
    total_bonuses: float
    total_complaints: int
    total_orders: int
