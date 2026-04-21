import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.master_requests import Master_requestsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/master_requests", tags=["master_requests"])


# ---------- Pydantic Schemas ----------
class Master_requestsData(BaseModel):
    """Entity data schema (for create/update)"""
    category: str
    problem_description: str
    address: str = None
    phone: str
    client_name: str = None
    status: str = None
    created_at: Optional[datetime] = None


class Master_requestsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    category: Optional[str] = None
    problem_description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    client_name: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None


class Master_requestsResponse(BaseModel):
    """Entity response schema"""
    id: int
    category: str
    problem_description: str
    address: Optional[str] = None
    phone: str
    client_name: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Master_requestsListResponse(BaseModel):
    """List response schema"""
    items: List[Master_requestsResponse]
    total: int
    skip: int
    limit: int


class Master_requestsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Master_requestsData]


class Master_requestsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Master_requestsUpdateData


class Master_requestsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Master_requestsBatchUpdateItem]


class Master_requestsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Master_requestsListResponse)
async def query_master_requestss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query master_requestss with filtering, sorting, and pagination"""
    logger.debug(f"Querying master_requestss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Master_requestsService(db)
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
        logger.debug(f"Found {result['total']} master_requestss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying master_requestss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Master_requestsListResponse)
async def query_master_requestss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query master_requestss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying master_requestss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Master_requestsService(db)
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
        logger.debug(f"Found {result['total']} master_requestss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying master_requestss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Master_requestsResponse)
async def get_master_requests(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single master_requests by ID"""
    logger.debug(f"Fetching master_requests with id: {id}, fields={fields}")
    
    service = Master_requestsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Master_requests with id {id} not found")
            raise HTTPException(status_code=404, detail="Master_requests not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching master_requests {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Master_requestsResponse, status_code=201)
async def create_master_requests(
    data: Master_requestsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new master_requests"""
    logger.debug(f"Creating new master_requests with data: {data}")
    
    service = Master_requestsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create master_requests")
        
        logger.info(f"Master_requests created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating master_requests: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating master_requests: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Master_requestsResponse], status_code=201)
async def create_master_requestss_batch(
    request: Master_requestsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple master_requestss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} master_requestss")
    
    service = Master_requestsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} master_requestss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Master_requestsResponse])
async def update_master_requestss_batch(
    request: Master_requestsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple master_requestss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} master_requestss")
    
    service = Master_requestsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} master_requestss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Master_requestsResponse)
async def update_master_requests(
    id: int,
    data: Master_requestsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing master_requests"""
    logger.debug(f"Updating master_requests {id} with data: {data}")

    service = Master_requestsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Master_requests with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Master_requests not found")
        
        logger.info(f"Master_requests {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating master_requests {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating master_requests {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_master_requestss_batch(
    request: Master_requestsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple master_requestss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} master_requestss")
    
    service = Master_requestsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} master_requestss successfully")
        return {"message": f"Successfully deleted {deleted_count} master_requestss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_master_requests(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single master_requests by ID"""
    logger.debug(f"Deleting master_requests with id: {id}")
    
    service = Master_requestsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Master_requests with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Master_requests not found")
        
        logger.info(f"Master_requests {id} deleted successfully")
        return {"message": "Master_requests deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting master_requests {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")