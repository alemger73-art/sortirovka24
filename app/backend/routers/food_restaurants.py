import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.food_restaurants import Food_restaurantsService

router = APIRouter(prefix="/api/v1/entities/food_restaurants", tags=["food_restaurants"])


class Food_restaurantsData(BaseModel):
    name: str = None
    photo: Optional[str] = None
    description: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    working_hours: Optional[str] = None
    min_order: Optional[float] = None
    delivery_time: Optional[str] = None
    cuisine_type: Optional[str] = None
    rating: Optional[float] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None


class Food_restaurantsUpdateData(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None
    description: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    working_hours: Optional[str] = None
    min_order: Optional[float] = None
    delivery_time: Optional[str] = None
    cuisine_type: Optional[str] = None
    rating: Optional[float] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None


class Food_restaurantsResponse(BaseModel):
    id: int
    name: Optional[str] = None
    photo: Optional[str] = None
    description: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    working_hours: Optional[str] = None
    min_order: Optional[float] = None
    delivery_time: Optional[str] = None
    cuisine_type: Optional[str] = None
    rating: Optional[float] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Food_restaurantsListResponse(BaseModel):
    items: List[Food_restaurantsResponse]
    total: int
    skip: int
    limit: int


@router.get("", response_model=Food_restaurantsListResponse)
async def query_food_restaurants(
    query: str = Query(None),
    sort: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
):
    service = Food_restaurantsService(db)
    query_dict = json.loads(query) if query else None
    return await service.get_list(skip=skip, limit=limit, query_dict=query_dict, sort=sort)


@router.get("/{id}", response_model=Food_restaurantsResponse)
async def get_food_restaurant(id: int, db: AsyncSession = Depends(get_db)):
    service = Food_restaurantsService(db)
    result = await service.get_by_id(id)
    if not result:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return result


@router.post("", response_model=Food_restaurantsResponse, status_code=201)
async def create_food_restaurant(data: Food_restaurantsData, db: AsyncSession = Depends(get_db)):
    service = Food_restaurantsService(db)
    result = await service.create(data.model_dump())
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create restaurant")
    return result


@router.put("/{id}", response_model=Food_restaurantsResponse)
async def update_food_restaurant(id: int, data: Food_restaurantsUpdateData, db: AsyncSession = Depends(get_db)):
    service = Food_restaurantsService(db)
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    result = await service.update(id, update_dict)
    if not result:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return result


@router.delete("/{id}")
async def delete_food_restaurant(id: int, db: AsyncSession = Depends(get_db)):
    service = Food_restaurantsService(db)
    ok = await service.delete(id)
    if not ok:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return {"message": "Restaurant deleted successfully", "id": id}
