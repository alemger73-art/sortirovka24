from pydantic import BaseModel, Field


class PushRegisterRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)
    platform: str = Field(..., pattern="^(android|ios)$")


class PushUnregisterRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)


class PushRegisterResponse(BaseModel):
    success: bool
    registered: bool
