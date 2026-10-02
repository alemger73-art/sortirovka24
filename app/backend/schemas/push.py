from pydantic import BaseModel, Field, field_validator

class PushPreferences(BaseModel):
    orders: bool = True
    delivery: bool = True
    news: bool = False
    marketing: bool = False
    bonuses: bool = True
    taxi: bool = True
    master: bool = True


class PushRegisterRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)
    platform: str = Field(..., pattern="^(android|ios)$")


class PushUnregisterRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)


class WebPushKeys(BaseModel):
    p256dh: str = Field(..., min_length=16, max_length=512)
    auth: str = Field(..., min_length=8, max_length=256)


class WebPushSubscription(BaseModel):
    endpoint: str = Field(..., min_length=20, max_length=4096, pattern=r"^https://")
    expirationTime: float | None = None
    keys: WebPushKeys


class WebPushRegisterRequest(BaseModel):
    subscription: WebPushSubscription
    browser: str | None = Field(None, pattern='^(chrome|safari|samsung|edge|firefox|other)$')
    device_platform: str | None = Field(None, pattern='^(ios|android|desktop)$')
    preferences: PushPreferences = Field(default_factory=PushPreferences)


class WebPushUnregisterRequest(BaseModel):
    endpoint: str = Field(..., min_length=20, max_length=4096, pattern=r"^https://")


class PushRegisterResponse(BaseModel):
    success: bool
    registered: bool


class PushBroadcastRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=500)
    path: str | None = Field(None, max_length=256, pattern=r"^/.*")
    user_id: str | None = Field(None, max_length=255)
    platform: str | None = Field(None, pattern="^(android|ios|web)$")
    category: str = Field('NEWS', pattern='^(ORDER|DELIVERY|NEWS|ADVERTISEMENT|SYSTEM)$')

    @field_validator('path')
    @classmethod
    def internal_path(cls, value):
        if value and (value.startswith('//') or any(ord(c) <= 32 or c == '\\' for c in value)):
            raise ValueError('Only internal paths are allowed')
        return value


class PushBroadcastResponse(BaseModel):
    success: bool
    sent: int
    failed: int
    total: int
    skipped: bool = False


class PushStatsResponse(BaseModel):
    enabled: bool
    total_devices: int
    active_devices: int
    android_active: int
    ios_active: int
    web_active: int = 0
    admin_active: int = 0
