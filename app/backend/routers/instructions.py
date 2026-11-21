"""«Инструкции»: public list of video guides."""
from fastapi import APIRouter

from services import instructions

router = APIRouter(prefix="/api/v1/instructions", tags=["instructions"])


@router.get("")
async def instruction_list():
    return {"items": list(instructions.listing())}
