import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.history_events import History_eventsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/history_events", tags=["history_events"])


# ---------- Pydantic Schemas ----------
class History_eventsData(BaseModel):
    """Entity data schema (for create/update)"""
    year: str = None
    title: str = None
    description: str = None
    image_url: str = None
    image_url_after: str = None
    category: str = None
    is_published: bool = None
    created_at: str = None


class History_eventsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    year: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    image_url_after: Optional[str] = None
    category: Optional[str] = None
    is_published: Optional[bool] = None
    created_at: Optional[str] = None


class History_eventsResponse(BaseModel):
    """Entity response schema"""
    id: int
    year: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    image_url_after: Optional[str] = None
    category: Optional[str] = None
    is_published: Optional[bool] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class History_eventsListResponse(BaseModel):
    """List response schema"""
    items: List[History_eventsResponse]
    total: int
    skip: int
    limit: int


class History_eventsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[History_eventsData]


class History_eventsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: History_eventsUpdateData


class History_eventsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[History_eventsBatchUpdateItem]


class History_eventsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=History_eventsListResponse)
async def query_history_eventss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query history_eventss with filtering, sorting, and pagination"""
    logger.debug(f"Querying history_eventss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = History_eventsService(db)
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
        logger.debug(f"Found {result['total']} history_eventss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying history_eventss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=History_eventsListResponse)
async def query_history_eventss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query history_eventss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying history_eventss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = History_eventsService(db)
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
        logger.debug(f"Found {result['total']} history_eventss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying history_eventss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=History_eventsResponse)
async def get_history_events(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single history_events by ID"""
    logger.debug(f"Fetching history_events with id: {id}, fields={fields}")
    
    service = History_eventsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"History_events with id {id} not found")
            raise HTTPException(status_code=404, detail="History_events not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching history_events {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=History_eventsResponse, status_code=201)
async def create_history_events(
    data: History_eventsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new history_events"""
    logger.debug(f"Creating new history_events with data: {data}")
    
    service = History_eventsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create history_events")
        
        logger.info(f"History_events created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating history_events: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating history_events: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[History_eventsResponse], status_code=201)
async def create_history_eventss_batch(
    request: History_eventsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple history_eventss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} history_eventss")
    
    service = History_eventsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} history_eventss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[History_eventsResponse])
async def update_history_eventss_batch(
    request: History_eventsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple history_eventss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} history_eventss")
    
    service = History_eventsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} history_eventss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=History_eventsResponse)
async def update_history_events(
    id: int,
    data: History_eventsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing history_events"""
    logger.debug(f"Updating history_events {id} with data: {data}")

    service = History_eventsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"History_events with id {id} not found for update")
            raise HTTPException(status_code=404, detail="History_events not found")
        
        logger.info(f"History_events {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating history_events {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating history_events {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_history_eventss_batch(
    request: History_eventsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple history_eventss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} history_eventss")
    
    service = History_eventsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} history_eventss successfully")
        return {"message": f"Successfully deleted {deleted_count} history_eventss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_history_events(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single history_events by ID"""
    logger.debug(f"Deleting history_events with id: {id}")
    
    service = History_eventsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"History_events with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="History_events not found")
        
        logger.info(f"History_events {id} deleted successfully")
        return {"message": "History_events deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting history_events {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")