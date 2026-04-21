import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.frontpad_sync_log import Frontpad_sync_logService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/frontpad_sync_log", tags=["frontpad_sync_log"])


# ---------- Pydantic Schemas ----------
class Frontpad_sync_logData(BaseModel):
    """Entity data schema (for create/update)"""
    sync_type: str
    status: str
    products_synced: int = None
    categories_synced: int = None
    errors: str = None
    started_at: str = None
    completed_at: str = None


class Frontpad_sync_logUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    sync_type: Optional[str] = None
    status: Optional[str] = None
    products_synced: Optional[int] = None
    categories_synced: Optional[int] = None
    errors: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class Frontpad_sync_logResponse(BaseModel):
    """Entity response schema"""
    id: int
    sync_type: str
    status: str
    products_synced: Optional[int] = None
    categories_synced: Optional[int] = None
    errors: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    class Config:
        from_attributes = True


class Frontpad_sync_logListResponse(BaseModel):
    """List response schema"""
    items: List[Frontpad_sync_logResponse]
    total: int
    skip: int
    limit: int


class Frontpad_sync_logBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Frontpad_sync_logData]


class Frontpad_sync_logBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Frontpad_sync_logUpdateData


class Frontpad_sync_logBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Frontpad_sync_logBatchUpdateItem]


class Frontpad_sync_logBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Frontpad_sync_logListResponse)
async def query_frontpad_sync_logs(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query frontpad_sync_logs with filtering, sorting, and pagination"""
    logger.debug(f"Querying frontpad_sync_logs: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Frontpad_sync_logService(db)
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
        logger.debug(f"Found {result['total']} frontpad_sync_logs")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying frontpad_sync_logs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Frontpad_sync_logListResponse)
async def query_frontpad_sync_logs_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query frontpad_sync_logs with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying frontpad_sync_logs: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Frontpad_sync_logService(db)
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
        logger.debug(f"Found {result['total']} frontpad_sync_logs")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying frontpad_sync_logs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Frontpad_sync_logResponse)
async def get_frontpad_sync_log(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single frontpad_sync_log by ID"""
    logger.debug(f"Fetching frontpad_sync_log with id: {id}, fields={fields}")
    
    service = Frontpad_sync_logService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Frontpad_sync_log with id {id} not found")
            raise HTTPException(status_code=404, detail="Frontpad_sync_log not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching frontpad_sync_log {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Frontpad_sync_logResponse, status_code=201)
async def create_frontpad_sync_log(
    data: Frontpad_sync_logData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new frontpad_sync_log"""
    logger.debug(f"Creating new frontpad_sync_log with data: {data}")
    
    service = Frontpad_sync_logService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create frontpad_sync_log")
        
        logger.info(f"Frontpad_sync_log created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating frontpad_sync_log: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating frontpad_sync_log: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Frontpad_sync_logResponse], status_code=201)
async def create_frontpad_sync_logs_batch(
    request: Frontpad_sync_logBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple frontpad_sync_logs in a single request"""
    logger.debug(f"Batch creating {len(request.items)} frontpad_sync_logs")
    
    service = Frontpad_sync_logService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} frontpad_sync_logs successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Frontpad_sync_logResponse])
async def update_frontpad_sync_logs_batch(
    request: Frontpad_sync_logBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple frontpad_sync_logs in a single request"""
    logger.debug(f"Batch updating {len(request.items)} frontpad_sync_logs")
    
    service = Frontpad_sync_logService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} frontpad_sync_logs successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Frontpad_sync_logResponse)
async def update_frontpad_sync_log(
    id: int,
    data: Frontpad_sync_logUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing frontpad_sync_log"""
    logger.debug(f"Updating frontpad_sync_log {id} with data: {data}")

    service = Frontpad_sync_logService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Frontpad_sync_log with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Frontpad_sync_log not found")
        
        logger.info(f"Frontpad_sync_log {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating frontpad_sync_log {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating frontpad_sync_log {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_frontpad_sync_logs_batch(
    request: Frontpad_sync_logBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple frontpad_sync_logs by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} frontpad_sync_logs")
    
    service = Frontpad_sync_logService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} frontpad_sync_logs successfully")
        return {"message": f"Successfully deleted {deleted_count} frontpad_sync_logs", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_frontpad_sync_log(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single frontpad_sync_log by ID"""
    logger.debug(f"Deleting frontpad_sync_log with id: {id}")
    
    service = Frontpad_sync_logService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Frontpad_sync_log with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Frontpad_sync_log not found")
        
        logger.info(f"Frontpad_sync_log {id} deleted successfully")
        return {"message": "Frontpad_sync_log deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting frontpad_sync_log {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")