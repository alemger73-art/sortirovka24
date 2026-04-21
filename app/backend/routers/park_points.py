import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.park_points import Park_pointsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/park_points", tags=["park_points"])


# ---------- Pydantic Schemas ----------
class Park_pointsData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str = None
    lat: float = None
    lng: float = None
    description: str = None
    is_active: bool = None
    sort_order: int = None
    created_at: str = None


class Park_pointsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None


class Park_pointsResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Park_pointsListResponse(BaseModel):
    """List response schema"""
    items: List[Park_pointsResponse]
    total: int
    skip: int
    limit: int


class Park_pointsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Park_pointsData]


class Park_pointsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Park_pointsUpdateData


class Park_pointsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Park_pointsBatchUpdateItem]


class Park_pointsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Park_pointsListResponse)
async def query_park_pointss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query park_pointss with filtering, sorting, and pagination"""
    logger.debug(f"Querying park_pointss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Park_pointsService(db)
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
        logger.debug(f"Found {result['total']} park_pointss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying park_pointss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Park_pointsListResponse)
async def query_park_pointss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query park_pointss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying park_pointss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Park_pointsService(db)
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
        logger.debug(f"Found {result['total']} park_pointss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying park_pointss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Park_pointsResponse)
async def get_park_points(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single park_points by ID"""
    logger.debug(f"Fetching park_points with id: {id}, fields={fields}")
    
    service = Park_pointsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Park_points with id {id} not found")
            raise HTTPException(status_code=404, detail="Park_points not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching park_points {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Park_pointsResponse, status_code=201)
async def create_park_points(
    data: Park_pointsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new park_points"""
    logger.debug(f"Creating new park_points with data: {data}")
    
    service = Park_pointsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create park_points")
        
        logger.info(f"Park_points created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating park_points: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating park_points: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Park_pointsResponse], status_code=201)
async def create_park_pointss_batch(
    request: Park_pointsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple park_pointss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} park_pointss")
    
    service = Park_pointsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} park_pointss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Park_pointsResponse])
async def update_park_pointss_batch(
    request: Park_pointsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple park_pointss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} park_pointss")
    
    service = Park_pointsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} park_pointss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Park_pointsResponse)
async def update_park_points(
    id: int,
    data: Park_pointsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing park_points"""
    logger.debug(f"Updating park_points {id} with data: {data}")

    service = Park_pointsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Park_points with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Park_points not found")
        
        logger.info(f"Park_points {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating park_points {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating park_points {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_park_pointss_batch(
    request: Park_pointsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple park_pointss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} park_pointss")
    
    service = Park_pointsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} park_pointss successfully")
        return {"message": f"Successfully deleted {deleted_count} park_pointss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_park_points(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single park_points by ID"""
    logger.debug(f"Deleting park_points with id: {id}")
    
    service = Park_pointsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Park_points with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Park_points not found")
        
        logger.info(f"Park_points {id} deleted successfully")
        return {"message": "Park_points deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting park_points {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")