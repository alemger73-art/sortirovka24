import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.homepage_stats import Homepage_statsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/homepage_stats", tags=["homepage_stats"])


# ---------- Pydantic Schemas ----------
class Homepage_statsData(BaseModel):
    """Entity data schema (for create/update)"""
    masters_count: int = None
    ads_count: int = None
    cafes_count: int = None
    is_auto: bool = None
    updated_at: str = None


class Homepage_statsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    masters_count: Optional[int] = None
    ads_count: Optional[int] = None
    cafes_count: Optional[int] = None
    is_auto: Optional[bool] = None
    updated_at: Optional[str] = None


class Homepage_statsResponse(BaseModel):
    """Entity response schema"""
    id: int
    masters_count: Optional[int] = None
    ads_count: Optional[int] = None
    cafes_count: Optional[int] = None
    is_auto: Optional[bool] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class Homepage_statsListResponse(BaseModel):
    """List response schema"""
    items: List[Homepage_statsResponse]
    total: int
    skip: int
    limit: int


class Homepage_statsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Homepage_statsData]


class Homepage_statsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Homepage_statsUpdateData


class Homepage_statsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Homepage_statsBatchUpdateItem]


class Homepage_statsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Homepage_statsListResponse)
async def query_homepage_statss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query homepage_statss with filtering, sorting, and pagination"""
    logger.debug(f"Querying homepage_statss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Homepage_statsService(db)
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
        logger.debug(f"Found {result['total']} homepage_statss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying homepage_statss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Homepage_statsListResponse)
async def query_homepage_statss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query homepage_statss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying homepage_statss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Homepage_statsService(db)
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
        logger.debug(f"Found {result['total']} homepage_statss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying homepage_statss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Homepage_statsResponse)
async def get_homepage_stats(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single homepage_stats by ID"""
    logger.debug(f"Fetching homepage_stats with id: {id}, fields={fields}")
    
    service = Homepage_statsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Homepage_stats with id {id} not found")
            raise HTTPException(status_code=404, detail="Homepage_stats not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching homepage_stats {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Homepage_statsResponse, status_code=201)
async def create_homepage_stats(
    data: Homepage_statsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new homepage_stats"""
    logger.debug(f"Creating new homepage_stats with data: {data}")
    
    service = Homepage_statsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create homepage_stats")
        
        logger.info(f"Homepage_stats created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating homepage_stats: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating homepage_stats: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Homepage_statsResponse], status_code=201)
async def create_homepage_statss_batch(
    request: Homepage_statsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple homepage_statss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} homepage_statss")
    
    service = Homepage_statsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} homepage_statss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Homepage_statsResponse])
async def update_homepage_statss_batch(
    request: Homepage_statsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple homepage_statss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} homepage_statss")
    
    service = Homepage_statsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} homepage_statss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Homepage_statsResponse)
async def update_homepage_stats(
    id: int,
    data: Homepage_statsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing homepage_stats"""
    logger.debug(f"Updating homepage_stats {id} with data: {data}")

    service = Homepage_statsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Homepage_stats with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Homepage_stats not found")
        
        logger.info(f"Homepage_stats {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating homepage_stats {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating homepage_stats {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_homepage_statss_batch(
    request: Homepage_statsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple homepage_statss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} homepage_statss")
    
    service = Homepage_statsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} homepage_statss successfully")
        return {"message": f"Successfully deleted {deleted_count} homepage_statss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_homepage_stats(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single homepage_stats by ID"""
    logger.debug(f"Deleting homepage_stats with id: {id}")
    
    service = Homepage_statsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Homepage_stats with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Homepage_stats not found")
        
        logger.info(f"Homepage_stats {id} deleted successfully")
        return {"message": "Homepage_stats deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting homepage_stats {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")