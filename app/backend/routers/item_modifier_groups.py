import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.item_modifier_groups import Item_modifier_groupsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/item_modifier_groups", tags=["item_modifier_groups"])


# ---------- Pydantic Schemas ----------
class Item_modifier_groupsData(BaseModel):
    """Entity data schema (for create/update)"""
    food_item_id: int = None
    modifier_group_id: int = None
    sort_order: int = None
    created_at: str = None


class Item_modifier_groupsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    food_item_id: Optional[int] = None
    modifier_group_id: Optional[int] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None


class Item_modifier_groupsResponse(BaseModel):
    """Entity response schema"""
    id: int
    food_item_id: Optional[int] = None
    modifier_group_id: Optional[int] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Item_modifier_groupsListResponse(BaseModel):
    """List response schema"""
    items: List[Item_modifier_groupsResponse]
    total: int
    skip: int
    limit: int


class Item_modifier_groupsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Item_modifier_groupsData]


class Item_modifier_groupsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Item_modifier_groupsUpdateData


class Item_modifier_groupsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Item_modifier_groupsBatchUpdateItem]


class Item_modifier_groupsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Item_modifier_groupsListResponse)
async def query_item_modifier_groupss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query item_modifier_groupss with filtering, sorting, and pagination"""
    logger.debug(f"Querying item_modifier_groupss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Item_modifier_groupsService(db)
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
        logger.debug(f"Found {result['total']} item_modifier_groupss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying item_modifier_groupss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Item_modifier_groupsListResponse)
async def query_item_modifier_groupss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query item_modifier_groupss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying item_modifier_groupss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Item_modifier_groupsService(db)
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
        logger.debug(f"Found {result['total']} item_modifier_groupss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying item_modifier_groupss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Item_modifier_groupsResponse)
async def get_item_modifier_groups(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single item_modifier_groups by ID"""
    logger.debug(f"Fetching item_modifier_groups with id: {id}, fields={fields}")
    
    service = Item_modifier_groupsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Item_modifier_groups with id {id} not found")
            raise HTTPException(status_code=404, detail="Item_modifier_groups not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching item_modifier_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Item_modifier_groupsResponse, status_code=201)
async def create_item_modifier_groups(
    data: Item_modifier_groupsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new item_modifier_groups"""
    logger.debug(f"Creating new item_modifier_groups with data: {data}")
    
    service = Item_modifier_groupsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create item_modifier_groups")
        
        logger.info(f"Item_modifier_groups created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating item_modifier_groups: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating item_modifier_groups: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Item_modifier_groupsResponse], status_code=201)
async def create_item_modifier_groupss_batch(
    request: Item_modifier_groupsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple item_modifier_groupss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} item_modifier_groupss")
    
    service = Item_modifier_groupsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} item_modifier_groupss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Item_modifier_groupsResponse])
async def update_item_modifier_groupss_batch(
    request: Item_modifier_groupsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple item_modifier_groupss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} item_modifier_groupss")
    
    service = Item_modifier_groupsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} item_modifier_groupss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Item_modifier_groupsResponse)
async def update_item_modifier_groups(
    id: int,
    data: Item_modifier_groupsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing item_modifier_groups"""
    logger.debug(f"Updating item_modifier_groups {id} with data: {data}")

    service = Item_modifier_groupsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Item_modifier_groups with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Item_modifier_groups not found")
        
        logger.info(f"Item_modifier_groups {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating item_modifier_groups {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating item_modifier_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_item_modifier_groupss_batch(
    request: Item_modifier_groupsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple item_modifier_groupss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} item_modifier_groupss")
    
    service = Item_modifier_groupsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} item_modifier_groupss successfully")
        return {"message": f"Successfully deleted {deleted_count} item_modifier_groupss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_item_modifier_groups(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single item_modifier_groups by ID"""
    logger.debug(f"Deleting item_modifier_groups with id: {id}")
    
    service = Item_modifier_groupsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Item_modifier_groups with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Item_modifier_groups not found")
        
        logger.info(f"Item_modifier_groups {id} deleted successfully")
        return {"message": "Item_modifier_groups deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting item_modifier_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")