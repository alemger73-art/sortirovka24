import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.food_categories import Food_categoriesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/food_categories", tags=["food_categories"])


# ---------- Pydantic Schemas ----------
class Food_categoriesData(BaseModel):
    """Entity data schema (for create/update)"""
    restaurant_id: Optional[int] = None
    name: str = None
    category_type: Optional[str] = None
    icon: str = None
    slug: Optional[str] = None
    image: Optional[str] = None
    sort_order: int = None
    is_active: bool = None
    created_at: str = None


class Food_categoriesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    restaurant_id: Optional[int] = None
    name: Optional[str] = None
    category_type: Optional[str] = None
    icon: Optional[str] = None
    slug: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None


class Food_categoriesResponse(BaseModel):
    """Entity response schema"""
    id: int
    restaurant_id: Optional[int] = None
    name: Optional[str] = None
    category_type: Optional[str] = None
    icon: Optional[str] = None
    slug: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Food_categoriesListResponse(BaseModel):
    """List response schema"""
    items: List[Food_categoriesResponse]
    total: int
    skip: int
    limit: int


class Food_categoriesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Food_categoriesData]


class Food_categoriesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Food_categoriesUpdateData


class Food_categoriesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Food_categoriesBatchUpdateItem]


class Food_categoriesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Food_categoriesListResponse)
async def query_food_categoriess(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query food_categoriess with filtering, sorting, and pagination"""
    logger.debug(f"Querying food_categoriess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Food_categoriesService(db)
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
        logger.debug(f"Found {result['total']} food_categoriess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying food_categoriess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Food_categoriesListResponse)
async def query_food_categoriess_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query food_categoriess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying food_categoriess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Food_categoriesService(db)
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
        logger.debug(f"Found {result['total']} food_categoriess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying food_categoriess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Food_categoriesResponse)
async def get_food_categories(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single food_categories by ID"""
    logger.debug(f"Fetching food_categories with id: {id}, fields={fields}")
    
    service = Food_categoriesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Food_categories with id {id} not found")
            raise HTTPException(status_code=404, detail="Food_categories not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching food_categories {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Food_categoriesResponse, status_code=201)
async def create_food_categories(
    data: Food_categoriesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new food_categories"""
    logger.debug(f"Creating new food_categories with data: {data}")
    
    service = Food_categoriesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create food_categories")
        
        logger.info(f"Food_categories created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating food_categories: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating food_categories: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Food_categoriesResponse], status_code=201)
async def create_food_categoriess_batch(
    request: Food_categoriesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple food_categoriess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} food_categoriess")
    
    service = Food_categoriesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} food_categoriess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Food_categoriesResponse])
async def update_food_categoriess_batch(
    request: Food_categoriesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple food_categoriess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} food_categoriess")
    
    service = Food_categoriesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} food_categoriess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Food_categoriesResponse)
async def update_food_categories(
    id: int,
    data: Food_categoriesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing food_categories"""
    logger.debug(f"Updating food_categories {id} with data: {data}")

    service = Food_categoriesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Food_categories with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Food_categories not found")
        
        logger.info(f"Food_categories {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating food_categories {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating food_categories {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_food_categoriess_batch(
    request: Food_categoriesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple food_categoriess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} food_categoriess")
    
    service = Food_categoriesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} food_categoriess successfully")
        return {"message": f"Successfully deleted {deleted_count} food_categoriess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_food_categories(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single food_categories by ID"""
    logger.debug(f"Deleting food_categories with id: {id}")
    
    service = Food_categoriesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Food_categories with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Food_categories not found")
        
        logger.info(f"Food_categories {id} deleted successfully")
        return {"message": "Food_categories deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting food_categories {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")