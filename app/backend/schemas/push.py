from pydantic import BaseModel, Field


class PushRegisterRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)
    platform: str = Field(..., pattern="^(android|ios)$")


class PushUnregisterRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)


class PushRegisterResponse(BaseModel):
    success: bool
    registered: bool


class PushBroadcastRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=500)
    path: str | None = Field(None, max_length=256, pattern=r"^/.*")
    user_id: str | None = Field(None, max_length=255)
    platform: str | None = Field(None, pattern="^(android|ios)$")


class PushBroadcastResponse(BaseModel):
    success: bool
    sent: int
    failed: int
    total: int
    skipped: bool = False
