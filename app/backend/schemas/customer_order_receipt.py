from pydantic import BaseModel, Field


class CustomerReceiptLine(BaseModel):
    model_config = {'extra': 'forbid'}
    line_index: int | None = Field(None, ge=0)
    id: int | None = Field(None, gt=0)
    quantity: int = Field(ge=1, le=99)
    modifiers: list[dict] = Field(default_factory=list, max_length=30)
    choices: list[dict] = Field(default_factory=list, max_length=30)


class CustomerReceiptChange(BaseModel):
    model_config = {'extra': 'forbid'}
    expected_version: int = Field(ge=0)
    items: list[CustomerReceiptLine] = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=3, max_length=500)
    selected_gift_id: str | None = Field(None, max_length=100)
    quoted_total: float | None = Field(None, ge=0, allow_inf_nan=False)
