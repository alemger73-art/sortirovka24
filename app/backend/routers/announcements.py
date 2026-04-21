import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.announcements import AnnouncementsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/announcements", tags=["announcements"])


# ---------- Pydantic Schemas ----------
class AnnouncementsData(BaseModel):
    """Entity data schema (for create/update)"""
    ann_type: str = None
    title: str = None
    description: str = None
    price: str = None
    address: str = None
    image_url: str = None
    gallery_images: str = None
    phone: str = None
    whatsapp: str = None
    telegram: str = None
    author_name: str = None
    active: bool = None
    status: str = None
    created_at: str = None


class AnnouncementsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    ann_type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[str] = None
    address: Optional[str] = None
    image_url: Optional[str] = None
    gallery_images: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    telegram: Optional[str] = None
    author_name: Optional[str] = None
    active: Optional[bool] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class AnnouncementsResponse(BaseModel):
    """Entity response schema"""
    id: int
    ann_type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[str] = None
    address: Optional[str] = None
    image_url: Optional[str] = None
    gallery_images: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    telegram: Optional[str] = None
    author_name: Optional[str] = None
    active: Optional[bool] = None
    status: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class AnnouncementsListResponse(BaseModel):
    """List response schema"""
    items: List[AnnouncementsResponse]
    total: int
    skip: int
    limit: int


class AnnouncementsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[AnnouncementsData]


class AnnouncementsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: AnnouncementsUpdateData


class AnnouncementsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[AnnouncementsBatchUpdateItem]


class AnnouncementsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=AnnouncementsListResponse)
async def query_announcementss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query announcementss with filtering, sorting, and pagination"""
    logger.debug(f"Querying announcementss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = AnnouncementsService(db)
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
        logger.debug(f"Found {result['total']} announcementss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying announcementss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=AnnouncementsListResponse)
async def query_announcementss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query announcementss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying announcementss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = AnnouncementsService(db)
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
        logger.debug(f"Found {result['total']} announcementss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying announcementss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=AnnouncementsResponse)
async def get_announcements(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single announcements by ID"""
    logger.debug(f"Fetching announcements with id: {id}, fields={fields}")
    
    service = AnnouncementsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Announcements with id {id} not found")
            raise HTTPException(status_code=404, detail="Announcements not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching announcements {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=AnnouncementsResponse, status_code=201)
async def create_announcements(
    data: AnnouncementsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new announcements"""
    logger.debug(f"Creating new announcements with data: {data}")
    
    service = AnnouncementsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create announcements")
        
        logger.info(f"Announcements created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating announcements: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating announcements: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[AnnouncementsResponse], status_code=201)
async def create_announcementss_batch(
    request: AnnouncementsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple announcementss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} announcementss")
    
    service = AnnouncementsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} announcementss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[AnnouncementsResponse])
async def update_announcementss_batch(
    request: AnnouncementsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple announcementss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} announcementss")
    
    service = AnnouncementsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} announcementss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=AnnouncementsResponse)
async def update_announcements(
    id: int,
    data: AnnouncementsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing announcements"""
    logger.debug(f"Updating announcements {id} with data: {data}")

    service = AnnouncementsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Announcements with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Announcements not found")
        
        logger.info(f"Announcements {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating announcements {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating announcements {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_announcementss_batch(
    request: AnnouncementsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple announcementss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} announcementss")
    
    service = AnnouncementsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} announcementss successfully")
        return {"message": f"Successfully deleted {deleted_count} announcementss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_announcements(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single announcements by ID"""
    logger.debug(f"Deleting announcements with id: {id}")
    
    service = AnnouncementsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Announcements with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Announcements not found")
        
        logger.info(f"Announcements {id} deleted successfully")
        return {"message": "Announcements deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting announcements {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")