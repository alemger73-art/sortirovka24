import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.food_items import Food_itemsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/food_items", tags=["food_items"])


# ---------- Pydantic Schemas ----------
class Food_itemsData(BaseModel):
    """Entity data schema (for create/update)"""
    category_id: int = None
    name: str = None
    description: str = None
    price: float = None
    image_url: str = None
    is_active: bool = None
    is_recommended: bool = None
    weight: str = None
    sort_order: int = None
    created_at: str = None


class Food_itemsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_recommended: Optional[bool] = None
    weight: Optional[str] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None


class Food_itemsResponse(BaseModel):
    """Entity response schema"""
    id: int
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_recommended: Optional[bool] = None
    weight: Optional[str] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Food_itemsListResponse(BaseModel):
    """List response schema"""
    items: List[Food_itemsResponse]
    total: int
    skip: int
    limit: int


class Food_itemsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Food_itemsData]


class Food_itemsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Food_itemsUpdateData


class Food_itemsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Food_itemsBatchUpdateItem]


class Food_itemsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Food_itemsListResponse)
async def query_food_itemss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query food_itemss with filtering, sorting, and pagination"""
    logger.debug(f"Querying food_itemss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Food_itemsService(db)
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
        logger.debug(f"Found {result['total']} food_itemss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying food_itemss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Food_itemsListResponse)
async def query_food_itemss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query food_itemss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying food_itemss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Food_itemsService(db)
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
        logger.debug(f"Found {result['total']} food_itemss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying food_itemss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Food_itemsResponse)
async def get_food_items(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single food_items by ID"""
    logger.debug(f"Fetching food_items with id: {id}, fields={fields}")
    
    service = Food_itemsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Food_items with id {id} not found")
            raise HTTPException(status_code=404, detail="Food_items not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching food_items {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Food_itemsResponse, status_code=201)
async def create_food_items(
    data: Food_itemsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new food_items"""
    logger.debug(f"Creating new food_items with data: {data}")
    
    service = Food_itemsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create food_items")
        
        logger.info(f"Food_items created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating food_items: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating food_items: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Food_itemsResponse], status_code=201)
async def create_food_itemss_batch(
    request: Food_itemsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple food_itemss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} food_itemss")
    
    service = Food_itemsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} food_itemss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Food_itemsResponse])
async def update_food_itemss_batch(
    request: Food_itemsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple food_itemss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} food_itemss")
    
    service = Food_itemsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} food_itemss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Food_itemsResponse)
async def update_food_items(
    id: int,
    data: Food_itemsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing food_items"""
    logger.debug(f"Updating food_items {id} with data: {data}")

    service = Food_itemsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Food_items with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Food_items not found")
        
        logger.info(f"Food_items {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating food_items {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating food_items {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_food_itemss_batch(
    request: Food_itemsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple food_itemss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} food_itemss")
    
    service = Food_itemsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} food_itemss successfully")
        return {"message": f"Successfully deleted {deleted_count} food_itemss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_food_items(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single food_items by ID"""
    logger.debug(f"Deleting food_items with id: {id}")
    
    service = Food_itemsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Food_items with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Food_items not found")
        
        logger.info(f"Food_items {id} deleted successfully")
        return {"message": "Food_items deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting food_items {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")