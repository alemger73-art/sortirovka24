import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.park_orders import Park_ordersService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/park_orders", tags=["park_orders"])


# ---------- Pydantic Schemas ----------
class Park_ordersData(BaseModel):
    """Entity data schema (for create/update)"""
    customer_name: str = None
    customer_phone: str = None
    point_id: int = None
    order_items: str = None
    total_amount: float = None
    status: str = None
    created_at: str = None


class Park_ordersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    point_id: Optional[int] = None
    order_items: Optional[str] = None
    total_amount: Optional[float] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class Park_ordersResponse(BaseModel):
    """Entity response schema"""
    id: int
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    point_id: Optional[int] = None
    order_items: Optional[str] = None
    total_amount: Optional[float] = None
    status: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Park_ordersListResponse(BaseModel):
    """List response schema"""
    items: List[Park_ordersResponse]
    total: int
    skip: int
    limit: int


class Park_ordersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Park_ordersData]


class Park_ordersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Park_ordersUpdateData


class Park_ordersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Park_ordersBatchUpdateItem]


class Park_ordersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Park_ordersListResponse)
async def query_park_orderss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query park_orderss with filtering, sorting, and pagination"""
    logger.debug(f"Querying park_orderss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Park_ordersService(db)
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
        logger.debug(f"Found {result['total']} park_orderss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying park_orderss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Park_ordersListResponse)
async def query_park_orderss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query park_orderss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying park_orderss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Park_ordersService(db)
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
        logger.debug(f"Found {result['total']} park_orderss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying park_orderss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Park_ordersResponse)
async def get_park_orders(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single park_orders by ID"""
    logger.debug(f"Fetching park_orders with id: {id}, fields={fields}")
    
    service = Park_ordersService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Park_orders with id {id} not found")
            raise HTTPException(status_code=404, detail="Park_orders not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching park_orders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Park_ordersResponse, status_code=201)
async def create_park_orders(
    data: Park_ordersData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new park_orders"""
    logger.debug(f"Creating new park_orders with data: {data}")
    
    service = Park_ordersService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create park_orders")
        
        logger.info(f"Park_orders created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating park_orders: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating park_orders: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Park_ordersResponse], status_code=201)
async def create_park_orderss_batch(
    request: Park_ordersBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple park_orderss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} park_orderss")
    
    service = Park_ordersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} park_orderss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Park_ordersResponse])
async def update_park_orderss_batch(
    request: Park_ordersBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple park_orderss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} park_orderss")
    
    service = Park_ordersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} park_orderss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Park_ordersResponse)
async def update_park_orders(
    id: int,
    data: Park_ordersUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing park_orders"""
    logger.debug(f"Updating park_orders {id} with data: {data}")

    service = Park_ordersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Park_orders with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Park_orders not found")
        
        logger.info(f"Park_orders {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating park_orders {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating park_orders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_park_orderss_batch(
    request: Park_ordersBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple park_orderss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} park_orderss")
    
    service = Park_ordersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} park_orderss successfully")
        return {"message": f"Successfully deleted {deleted_count} park_orderss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_park_orders(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single park_orders by ID"""
    logger.debug(f"Deleting park_orders with id: {id}")
    
    service = Park_ordersService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Park_orders with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Park_orders not found")
        
        logger.info(f"Park_orders {id} deleted successfully")
        return {"message": "Park_orders deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting park_orders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")