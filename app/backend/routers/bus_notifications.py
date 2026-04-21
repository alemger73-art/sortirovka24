import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.bus_notifications import Bus_notificationsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/bus_notifications", tags=["bus_notifications"])


# ---------- Pydantic Schemas ----------
class Bus_notificationsData(BaseModel):
    """Entity data schema (for create/update)"""
    route_id: int = None
    title: str = None
    message: str = None
    is_active: bool = None
    created_at: str = None


class Bus_notificationsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    route_id: Optional[int] = None
    title: Optional[str] = None
    message: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None


class Bus_notificationsResponse(BaseModel):
    """Entity response schema"""
    id: int
    route_id: Optional[int] = None
    title: Optional[str] = None
    message: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Bus_notificationsListResponse(BaseModel):
    """List response schema"""
    items: List[Bus_notificationsResponse]
    total: int
    skip: int
    limit: int


class Bus_notificationsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Bus_notificationsData]


class Bus_notificationsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Bus_notificationsUpdateData


class Bus_notificationsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Bus_notificationsBatchUpdateItem]


class Bus_notificationsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Bus_notificationsListResponse)
async def query_bus_notificationss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query bus_notificationss with filtering, sorting, and pagination"""
    logger.debug(f"Querying bus_notificationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Bus_notificationsService(db)
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
        logger.debug(f"Found {result['total']} bus_notificationss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying bus_notificationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Bus_notificationsListResponse)
async def query_bus_notificationss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query bus_notificationss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying bus_notificationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Bus_notificationsService(db)
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
        logger.debug(f"Found {result['total']} bus_notificationss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying bus_notificationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Bus_notificationsResponse)
async def get_bus_notifications(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single bus_notifications by ID"""
    logger.debug(f"Fetching bus_notifications with id: {id}, fields={fields}")
    
    service = Bus_notificationsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Bus_notifications with id {id} not found")
            raise HTTPException(status_code=404, detail="Bus_notifications not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching bus_notifications {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Bus_notificationsResponse, status_code=201)
async def create_bus_notifications(
    data: Bus_notificationsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new bus_notifications"""
    logger.debug(f"Creating new bus_notifications with data: {data}")
    
    service = Bus_notificationsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create bus_notifications")
        
        logger.info(f"Bus_notifications created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating bus_notifications: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating bus_notifications: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Bus_notificationsResponse], status_code=201)
async def create_bus_notificationss_batch(
    request: Bus_notificationsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple bus_notificationss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} bus_notificationss")
    
    service = Bus_notificationsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} bus_notificationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Bus_notificationsResponse])
async def update_bus_notificationss_batch(
    request: Bus_notificationsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple bus_notificationss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} bus_notificationss")
    
    service = Bus_notificationsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} bus_notificationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Bus_notificationsResponse)
async def update_bus_notifications(
    id: int,
    data: Bus_notificationsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing bus_notifications"""
    logger.debug(f"Updating bus_notifications {id} with data: {data}")

    service = Bus_notificationsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Bus_notifications with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Bus_notifications not found")
        
        logger.info(f"Bus_notifications {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating bus_notifications {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating bus_notifications {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_bus_notificationss_batch(
    request: Bus_notificationsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple bus_notificationss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} bus_notificationss")
    
    service = Bus_notificationsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} bus_notificationss successfully")
        return {"message": f"Successfully deleted {deleted_count} bus_notificationss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_bus_notifications(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single bus_notifications by ID"""
    logger.debug(f"Deleting bus_notifications with id: {id}")
    
    service = Bus_notificationsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Bus_notifications with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Bus_notifications not found")
        
        logger.info(f"Bus_notifications {id} deleted successfully")
        return {"message": "Bus_notifications deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bus_notifications {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")