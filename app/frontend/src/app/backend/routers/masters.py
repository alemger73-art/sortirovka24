import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.masters import MastersService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/masters", tags=["masters"])


# ---------- Pydantic Schemas ----------
class MastersData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    category: str
    phone: str
    whatsapp: str = None
    district: str = None
    description: str = None
    rating: float = None
    reviews_count: int = None
    photo_url: str = None
    verified: bool = None
    available_today: bool = None
    services: str = None
    experience_years: int = None
    created_at: Optional[datetime] = None


class MastersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    district: Optional[str] = None
    description: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    photo_url: Optional[str] = None
    verified: Optional[bool] = None
    available_today: Optional[bool] = None
    services: Optional[str] = None
    experience_years: Optional[int] = None
    created_at: Optional[datetime] = None


class MastersResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: str
    category: str
    phone: str
    whatsapp: Optional[str] = None
    district: Optional[str] = None
    description: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    photo_url: Optional[str] = None
    verified: Optional[bool] = None
    available_today: Optional[bool] = None
    services: Optional[str] = None
    experience_years: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MastersListResponse(BaseModel):
    """List response schema"""
    items: List[MastersResponse]
    total: int
    skip: int
    limit: int


class MastersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[MastersData]


class MastersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: MastersUpdateData


class MastersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[MastersBatchUpdateItem]


class MastersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=MastersListResponse)
async def query_masterss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query masterss with filtering, sorting, and pagination"""
    logger.debug(f"Querying masterss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = MastersService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
        )
        logger.debug(f"Found {result['total']} masterss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying masterss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=MastersListResponse)
async def query_masterss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query masterss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying masterss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = MastersService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} masterss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying masterss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=MastersResponse)
async def get_masters(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single masters by ID"""
    logger.debug(f"Fetching masters with id: {id}, fields={fields}")
    
    service = MastersService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Masters with id {id} not found")
            raise HTTPException(status_code=404, detail="Masters not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching masters {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=MastersResponse, status_code=201)
async def create_masters(
    data: MastersData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new masters"""
    logger.debug(f"Creating new masters with data: {data}")
    
    service = MastersService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create masters")
        
        logger.info(f"Masters created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating masters: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating masters: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[MastersResponse], status_code=201)
async def create_masterss_batch(
    request: MastersBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple masterss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} masterss")
    
    service = MastersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} masterss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[MastersResponse])
async def update_masterss_batch(
    request: MastersBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple masterss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} masterss")
    
    service = MastersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} masterss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=MastersResponse)
async def update_masters(
    id: int,
    data: MastersUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing masters"""
    logger.debug(f"Updating masters {id} with data: {data}")

    service = MastersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Masters with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Masters not found")
        
        logger.info(f"Masters {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating masters {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating masters {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_masterss_batch(
    request: MastersBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple masterss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} masterss")
    
    service = MastersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} masterss successfully")
        return {"message": f"Successfully deleted {deleted_count} masterss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_masters(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single masters by ID"""
    logger.debug(f"Deleting masters with id: {id}")
    
    service = MastersService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Masters with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Masters not found")
        
        logger.info(f"Masters {id} deleted successfully")
        return {"message": "Masters deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting masters {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")