import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.directory_entries import Directory_entriesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/directory_entries", tags=["directory_entries"])


# ---------- Pydantic Schemas ----------
class Directory_entriesData(BaseModel):
    """Entity data schema (for create/update)"""
    entry_name: str = None
    category: str = None
    address: str = None
    phone: str = None
    description: str = None
    created_at: str = None


class Directory_entriesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    entry_name: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[str] = None


class Directory_entriesResponse(BaseModel):
    """Entity response schema"""
    id: int
    entry_name: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Directory_entriesListResponse(BaseModel):
    """List response schema"""
    items: List[Directory_entriesResponse]
    total: int
    skip: int
    limit: int


class Directory_entriesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Directory_entriesData]


class Directory_entriesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Directory_entriesUpdateData


class Directory_entriesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Directory_entriesBatchUpdateItem]


class Directory_entriesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Directory_entriesListResponse)
async def query_directory_entriess(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query directory_entriess with filtering, sorting, and pagination"""
    logger.debug(f"Querying directory_entriess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Directory_entriesService(db)
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
        logger.debug(f"Found {result['total']} directory_entriess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying directory_entriess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Directory_entriesListResponse)
async def query_directory_entriess_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query directory_entriess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying directory_entriess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Directory_entriesService(db)
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
        logger.debug(f"Found {result['total']} directory_entriess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying directory_entriess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Directory_entriesResponse)
async def get_directory_entries(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single directory_entries by ID"""
    logger.debug(f"Fetching directory_entries with id: {id}, fields={fields}")
    
    service = Directory_entriesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Directory_entries with id {id} not found")
            raise HTTPException(status_code=404, detail="Directory_entries not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching directory_entries {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Directory_entriesResponse, status_code=201)
async def create_directory_entries(
    data: Directory_entriesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new directory_entries"""
    logger.debug(f"Creating new directory_entries with data: {data}")
    
    service = Directory_entriesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create directory_entries")
        
        logger.info(f"Directory_entries created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating directory_entries: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating directory_entries: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Directory_entriesResponse], status_code=201)
async def create_directory_entriess_batch(
    request: Directory_entriesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple directory_entriess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} directory_entriess")
    
    service = Directory_entriesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} directory_entriess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Directory_entriesResponse])
async def update_directory_entriess_batch(
    request: Directory_entriesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple directory_entriess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} directory_entriess")
    
    service = Directory_entriesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} directory_entriess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Directory_entriesResponse)
async def update_directory_entries(
    id: int,
    data: Directory_entriesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing directory_entries"""
    logger.debug(f"Updating directory_entries {id} with data: {data}")

    service = Directory_entriesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Directory_entries with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Directory_entries not found")
        
        logger.info(f"Directory_entries {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating directory_entries {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating directory_entries {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_directory_entriess_batch(
    request: Directory_entriesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple directory_entriess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} directory_entriess")
    
    service = Directory_entriesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} directory_entriess successfully")
        return {"message": f"Successfully deleted {deleted_count} directory_entriess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_directory_entries(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single directory_entries by ID"""
    logger.debug(f"Deleting directory_entries with id: {id}")
    
    service = Directory_entriesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Directory_entries with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Directory_entries not found")
        
        logger.info(f"Directory_entries {id} deleted successfully")
        return {"message": "Directory_entries deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting directory_entries {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")