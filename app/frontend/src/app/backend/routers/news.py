import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.news import NewsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/news", tags=["news"])


# ---------- Pydantic Schemas ----------
class NewsData(BaseModel):
    """Entity data schema (for create/update)"""
    title: str
    content: str
    short_description: str = None
    category: str
    image_url: str = None
    youtube_url: str = None
    published: bool = None
    created_at: Optional[datetime] = None


class NewsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    title: Optional[str] = None
    content: Optional[str] = None
    short_description: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    youtube_url: Optional[str] = None
    published: Optional[bool] = None
    created_at: Optional[datetime] = None


class NewsResponse(BaseModel):
    """Entity response schema"""
    id: int
    title: str
    content: str
    short_description: Optional[str] = None
    category: str
    image_url: Optional[str] = None
    youtube_url: Optional[str] = None
    published: Optional[bool] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NewsListResponse(BaseModel):
    """List response schema"""
    items: List[NewsResponse]
    total: int
    skip: int
    limit: int


class NewsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[NewsData]


class NewsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: NewsUpdateData


class NewsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[NewsBatchUpdateItem]


class NewsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=NewsListResponse)
async def query_newss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query newss with filtering, sorting, and pagination"""
    logger.debug(f"Querying newss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = NewsService(db)
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
        logger.debug(f"Found {result['total']} newss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying newss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=NewsListResponse)
async def query_newss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query newss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying newss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = NewsService(db)
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
        logger.debug(f"Found {result['total']} newss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying newss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=NewsResponse)
async def get_news(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single news by ID"""
    logger.debug(f"Fetching news with id: {id}, fields={fields}")
    
    service = NewsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"News with id {id} not found")
            raise HTTPException(status_code=404, detail="News not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching news {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=NewsResponse, status_code=201)
async def create_news(
    data: NewsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new news"""
    logger.debug(f"Creating new news with data: {data}")
    
    service = NewsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create news")
        
        logger.info(f"News created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating news: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating news: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[NewsResponse], status_code=201)
async def create_newss_batch(
    request: NewsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple newss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} newss")
    
    service = NewsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} newss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[NewsResponse])
async def update_newss_batch(
    request: NewsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple newss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} newss")
    
    service = NewsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} newss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=NewsResponse)
async def update_news(
    id: int,
    data: NewsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing news"""
    logger.debug(f"Updating news {id} with data: {data}")

    service = NewsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"News with id {id} not found for update")
            raise HTTPException(status_code=404, detail="News not found")
        
        logger.info(f"News {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating news {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating news {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_newss_batch(
    request: NewsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple newss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} newss")
    
    service = NewsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} newss successfully")
        return {"message": f"Successfully deleted {deleted_count} newss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_news(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single news by ID"""
    logger.debug(f"Deleting news with id: {id}")
    
    service = NewsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"News with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="News not found")
        
        logger.info(f"News {id} deleted successfully")
        return {"message": "News deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting news {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")