import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.couriers import CouriersService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/couriers", tags=["couriers"])


# ---------- Pydantic Schemas ----------
class CouriersData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str = None
    phone: str = None
    is_active: bool = None
    pin_code: str = None
    created_at: str = None


class CouriersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    pin_code: Optional[str] = None
    created_at: Optional[str] = None


class CouriersResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    pin_code: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class CouriersListResponse(BaseModel):
    """List response schema"""
    items: List[CouriersResponse]
    total: int
    skip: int
    limit: int


class CouriersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[CouriersData]


class CouriersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: CouriersUpdateData


class CouriersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[CouriersBatchUpdateItem]


class CouriersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=CouriersListResponse)
async def query_courierss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query courierss with filtering, sorting, and pagination"""
    logger.debug(f"Querying courierss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = CouriersService(db)
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
        logger.debug(f"Found {result['total']} courierss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying courierss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=CouriersListResponse)
async def query_courierss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query courierss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying courierss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = CouriersService(db)
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
        logger.debug(f"Found {result['total']} courierss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying courierss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=CouriersResponse)
async def get_couriers(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single couriers by ID"""
    logger.debug(f"Fetching couriers with id: {id}, fields={fields}")
    
    service = CouriersService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Couriers with id {id} not found")
            raise HTTPException(status_code=404, detail="Couriers not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching couriers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=CouriersResponse, status_code=201)
async def create_couriers(
    data: CouriersData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new couriers"""
    logger.debug(f"Creating new couriers with data: {data}")
    
    service = CouriersService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create couriers")
        
        logger.info(f"Couriers created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating couriers: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating couriers: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[CouriersResponse], status_code=201)
async def create_courierss_batch(
    request: CouriersBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple courierss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} courierss")
    
    service = CouriersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} courierss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[CouriersResponse])
async def update_courierss_batch(
    request: CouriersBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple courierss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} courierss")
    
    service = CouriersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} courierss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=CouriersResponse)
async def update_couriers(
    id: int,
    data: CouriersUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing couriers"""
    logger.debug(f"Updating couriers {id} with data: {data}")

    service = CouriersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Couriers with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Couriers not found")
        
        logger.info(f"Couriers {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating couriers {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating couriers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_courierss_batch(
    request: CouriersBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple courierss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} courierss")
    
    service = CouriersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} courierss successfully")
        return {"message": f"Successfully deleted {deleted_count} courierss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_couriers(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single couriers by ID"""
    logger.debug(f"Deleting couriers with id: {id}")
    
    service = CouriersService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Couriers with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Couriers not found")
        
        logger.info(f"Couriers {id} deleted successfully")
        return {"message": "Couriers deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting couriers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")