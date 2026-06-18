import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.salons import SalonsService

# Set up logging
logger = logging.getLogger(__name__)

from services.module_settings import require_module

router = APIRouter(
    prefix="/api/v1/entities/salons",
    tags=["salons"],
    dependencies=[Depends(require_module("salons"))],
)


# ---------- Pydantic Schemas ----------
class SalonsData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str = None
    category: str = None
    address: str = None
    district: str = None
    phone: str = None
    whatsapp: str = None
    instagram: str = None
    description: str = None
    services: str = None
    working_hours: str = None
    price_from: str = None
    photo_url: str = None
    gallery_images: str = None
    rating: float = None
    reviews_count: int = None
    verified: bool = None
    featured: bool = None
    sort_order: int = None
    created_at: str = None


class SalonsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram: Optional[str] = None
    description: Optional[str] = None
    services: Optional[str] = None
    working_hours: Optional[str] = None
    price_from: Optional[str] = None
    photo_url: Optional[str] = None
    gallery_images: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    verified: Optional[bool] = None
    featured: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None


class SalonsResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram: Optional[str] = None
    description: Optional[str] = None
    services: Optional[str] = None
    working_hours: Optional[str] = None
    price_from: Optional[str] = None
    photo_url: Optional[str] = None
    gallery_images: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    verified: Optional[bool] = None
    featured: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class SalonsListResponse(BaseModel):
    """List response schema"""
    items: List[SalonsResponse]
    total: int
    skip: int
    limit: int


class SalonsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[SalonsData]


class SalonsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: SalonsUpdateData


class SalonsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[SalonsBatchUpdateItem]


class SalonsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=SalonsListResponse)
async def query_salons(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query salons with filtering, sorting, and pagination"""
    service = SalonsService(db)
    try:
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(skip=skip, limit=limit, query_dict=query_dict, sort=sort)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying salons: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=SalonsListResponse)
async def query_salons_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    service = SalonsService(db)
    try:
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(skip=skip, limit=limit, query_dict=query_dict, sort=sort)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying salons: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=SalonsResponse)
async def get_salon(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single salon by ID"""
    service = SalonsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            raise HTTPException(status_code=404, detail="Salon not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching salon {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=SalonsResponse, status_code=201)
async def create_salon(
    data: SalonsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new salon"""
    service = SalonsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create salon")
        logger.info(f"Salon created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating salon: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating salon: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[SalonsResponse], status_code=201)
async def create_salons_batch(
    request: SalonsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple salons in a single request"""
    service = SalonsService(db)
    results = []
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[SalonsResponse])
async def update_salons_batch(
    request: SalonsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple salons in a single request"""
    service = SalonsService(db)
    results = []
    try:
        for item in request.items:
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=SalonsResponse)
async def update_salon(
    id: int,
    data: SalonsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing salon"""
    service = SalonsService(db)
    try:
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            raise HTTPException(status_code=404, detail="Salon not found")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating salon {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating salon {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_salons_batch(
    request: SalonsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple salons by their IDs"""
    service = SalonsService(db)
    deleted_count = 0
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        return {"message": f"Successfully deleted {deleted_count} salons", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_salon(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single salon by ID"""
    service = SalonsService(db)
    try:
        success = await service.delete(id)
        if not success:
            raise HTTPException(status_code=404, detail="Salon not found")
        return {"message": "Salon deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting salon {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
