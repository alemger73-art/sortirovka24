import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.health_check import Health_checkService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/health_check", tags=["health_check"])


# ---------- Pydantic Schemas ----------
class Health_checkData(BaseModel):
    """Entity data schema (for create/update)"""
    pass


class Health_checkUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    pass


class Health_checkResponse(BaseModel):
    """Entity response schema"""
    id: int
    pass

    class Config:
        from_attributes = True


class Health_checkListResponse(BaseModel):
    """List response schema"""
    items: List[Health_checkResponse]
    total: int
    skip: int
    limit: int


class Health_checkBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Health_checkData]


class Health_checkBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Health_checkUpdateData


class Health_checkBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Health_checkBatchUpdateItem]


class Health_checkBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Health_checkListResponse)
async def query_health_checks(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query health_checks with filtering, sorting, and pagination"""
    logger.debug(f"Querying health_checks: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Health_checkService(db)
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
        logger.debug(f"Found {result['total']} health_checks")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying health_checks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Health_checkListResponse)
async def query_health_checks_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query health_checks with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying health_checks: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Health_checkService(db)
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
        logger.debug(f"Found {result['total']} health_checks")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying health_checks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Health_checkResponse)
async def get_health_check(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single health_check by ID"""
    logger.debug(f"Fetching health_check with id: {id}, fields={fields}")
    
    service = Health_checkService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Health_check with id {id} not found")
            raise HTTPException(status_code=404, detail="Health_check not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching health_check {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Health_checkResponse, status_code=201)
async def create_health_check(
    data: Health_checkData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new health_check"""
    logger.debug(f"Creating new health_check with data: {data}")
    
    service = Health_checkService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create health_check")
        
        logger.info(f"Health_check created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating health_check: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating health_check: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Health_checkResponse], status_code=201)
async def create_health_checks_batch(
    request: Health_checkBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple health_checks in a single request"""
    logger.debug(f"Batch creating {len(request.items)} health_checks")
    
    service = Health_checkService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} health_checks successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Health_checkResponse])
async def update_health_checks_batch(
    request: Health_checkBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple health_checks in a single request"""
    logger.debug(f"Batch updating {len(request.items)} health_checks")
    
    service = Health_checkService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} health_checks successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Health_checkResponse)
async def update_health_check(
    id: int,
    data: Health_checkUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing health_check"""
    logger.debug(f"Updating health_check {id} with data: {data}")

    service = Health_checkService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Health_check with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Health_check not found")
        
        logger.info(f"Health_check {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating health_check {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating health_check {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_health_checks_batch(
    request: Health_checkBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple health_checks by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} health_checks")
    
    service = Health_checkService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} health_checks successfully")
        return {"message": f"Successfully deleted {deleted_count} health_checks", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_health_check(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single health_check by ID"""
    logger.debug(f"Deleting health_check with id: {id}")
    
    service = Health_checkService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Health_check with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Health_check not found")
        
        logger.info(f"Health_check {id} deleted successfully")
        return {"message": "Health_check deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting health_check {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")