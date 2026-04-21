import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.modifier_groups import Modifier_groupsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/modifier_groups", tags=["modifier_groups"])


# ---------- Pydantic Schemas ----------
class Modifier_groupsData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str = None
    type: str = None
    is_required: bool = None
    min_select: int = None
    max_select: int = None
    sort_order: int = None
    is_active: bool = None
    created_at: str = None


class Modifier_groupsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    type: Optional[str] = None
    is_required: Optional[bool] = None
    min_select: Optional[int] = None
    max_select: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None


class Modifier_groupsResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: Optional[str] = None
    type: Optional[str] = None
    is_required: Optional[bool] = None
    min_select: Optional[int] = None
    max_select: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Modifier_groupsListResponse(BaseModel):
    """List response schema"""
    items: List[Modifier_groupsResponse]
    total: int
    skip: int
    limit: int


class Modifier_groupsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Modifier_groupsData]


class Modifier_groupsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Modifier_groupsUpdateData


class Modifier_groupsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Modifier_groupsBatchUpdateItem]


class Modifier_groupsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Modifier_groupsListResponse)
async def query_modifier_groupss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query modifier_groupss with filtering, sorting, and pagination"""
    logger.debug(f"Querying modifier_groupss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Modifier_groupsService(db)
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
        logger.debug(f"Found {result['total']} modifier_groupss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying modifier_groupss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Modifier_groupsListResponse)
async def query_modifier_groupss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query modifier_groupss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying modifier_groupss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Modifier_groupsService(db)
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
        logger.debug(f"Found {result['total']} modifier_groupss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying modifier_groupss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Modifier_groupsResponse)
async def get_modifier_groups(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single modifier_groups by ID"""
    logger.debug(f"Fetching modifier_groups with id: {id}, fields={fields}")
    
    service = Modifier_groupsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Modifier_groups with id {id} not found")
            raise HTTPException(status_code=404, detail="Modifier_groups not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching modifier_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Modifier_groupsResponse, status_code=201)
async def create_modifier_groups(
    data: Modifier_groupsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new modifier_groups"""
    logger.debug(f"Creating new modifier_groups with data: {data}")
    
    service = Modifier_groupsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create modifier_groups")
        
        logger.info(f"Modifier_groups created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating modifier_groups: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating modifier_groups: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Modifier_groupsResponse], status_code=201)
async def create_modifier_groupss_batch(
    request: Modifier_groupsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple modifier_groupss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} modifier_groupss")
    
    service = Modifier_groupsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} modifier_groupss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Modifier_groupsResponse])
async def update_modifier_groupss_batch(
    request: Modifier_groupsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple modifier_groupss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} modifier_groupss")
    
    service = Modifier_groupsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} modifier_groupss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Modifier_groupsResponse)
async def update_modifier_groups(
    id: int,
    data: Modifier_groupsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing modifier_groups"""
    logger.debug(f"Updating modifier_groups {id} with data: {data}")

    service = Modifier_groupsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Modifier_groups with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Modifier_groups not found")
        
        logger.info(f"Modifier_groups {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating modifier_groups {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating modifier_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_modifier_groupss_batch(
    request: Modifier_groupsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple modifier_groupss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} modifier_groupss")
    
    service = Modifier_groupsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} modifier_groupss successfully")
        return {"message": f"Successfully deleted {deleted_count} modifier_groupss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_modifier_groups(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single modifier_groups by ID"""
    logger.debug(f"Deleting modifier_groups with id: {id}")
    
    service = Modifier_groupsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Modifier_groups with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Modifier_groups not found")
        
        logger.info(f"Modifier_groups {id} deleted successfully")
        return {"message": "Modifier_groups deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting modifier_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")