import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.bus_routes import Bus_routesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/bus_routes", tags=["bus_routes"])


# ---------- Pydantic Schemas ----------
class Bus_routesData(BaseModel):
    """Entity data schema (for create/update)"""
    route_number: str = None
    route_name: str = None
    description: str = None
    color: str = None
    first_departure_weekday: str = None
    last_departure_weekday: str = None
    interval_weekday: str = None
    first_departure_weekend: str = None
    last_departure_weekend: str = None
    interval_weekend: str = None
    is_active: bool = None
    sort_order: int = None
    created_at: str = None


class Bus_routesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    route_number: Optional[str] = None
    route_name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    first_departure_weekday: Optional[str] = None
    last_departure_weekday: Optional[str] = None
    interval_weekday: Optional[str] = None
    first_departure_weekend: Optional[str] = None
    last_departure_weekend: Optional[str] = None
    interval_weekend: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None


class Bus_routesResponse(BaseModel):
    """Entity response schema"""
    id: int
    route_number: Optional[str] = None
    route_name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    first_departure_weekday: Optional[str] = None
    last_departure_weekday: Optional[str] = None
    interval_weekday: Optional[str] = None
    first_departure_weekend: Optional[str] = None
    last_departure_weekend: Optional[str] = None
    interval_weekend: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Bus_routesListResponse(BaseModel):
    """List response schema"""
    items: List[Bus_routesResponse]
    total: int
    skip: int
    limit: int


class Bus_routesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Bus_routesData]


class Bus_routesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Bus_routesUpdateData


class Bus_routesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Bus_routesBatchUpdateItem]


class Bus_routesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Bus_routesListResponse)
async def query_bus_routess(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query bus_routess with filtering, sorting, and pagination"""
    logger.debug(f"Querying bus_routess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Bus_routesService(db)
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
        logger.debug(f"Found {result['total']} bus_routess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying bus_routess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Bus_routesListResponse)
async def query_bus_routess_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query bus_routess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying bus_routess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Bus_routesService(db)
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
        logger.debug(f"Found {result['total']} bus_routess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying bus_routess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Bus_routesResponse)
async def get_bus_routes(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single bus_routes by ID"""
    logger.debug(f"Fetching bus_routes with id: {id}, fields={fields}")
    
    service = Bus_routesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Bus_routes with id {id} not found")
            raise HTTPException(status_code=404, detail="Bus_routes not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching bus_routes {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Bus_routesResponse, status_code=201)
async def create_bus_routes(
    data: Bus_routesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new bus_routes"""
    logger.debug(f"Creating new bus_routes with data: {data}")
    
    service = Bus_routesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create bus_routes")
        
        logger.info(f"Bus_routes created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating bus_routes: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating bus_routes: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Bus_routesResponse], status_code=201)
async def create_bus_routess_batch(
    request: Bus_routesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple bus_routess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} bus_routess")
    
    service = Bus_routesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} bus_routess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Bus_routesResponse])
async def update_bus_routess_batch(
    request: Bus_routesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple bus_routess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} bus_routess")
    
    service = Bus_routesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} bus_routess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Bus_routesResponse)
async def update_bus_routes(
    id: int,
    data: Bus_routesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing bus_routes"""
    logger.debug(f"Updating bus_routes {id} with data: {data}")

    service = Bus_routesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Bus_routes with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Bus_routes not found")
        
        logger.info(f"Bus_routes {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating bus_routes {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating bus_routes {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_bus_routess_batch(
    request: Bus_routesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple bus_routess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} bus_routess")
    
    service = Bus_routesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} bus_routess successfully")
        return {"message": f"Successfully deleted {deleted_count} bus_routess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_bus_routes(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single bus_routes by ID"""
    logger.debug(f"Deleting bus_routes with id: {id}")
    
    service = Bus_routesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Bus_routes with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Bus_routes not found")
        
        logger.info(f"Bus_routes {id} deleted successfully")
        return {"message": "Bus_routes deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bus_routes {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")