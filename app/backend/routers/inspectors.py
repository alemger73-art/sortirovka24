import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.inspectors import InspectorsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/inspectors", tags=["inspectors"])


# ---------- Pydantic Schemas ----------
class InspectorsData(BaseModel):
    """Entity data schema (for create/update)"""
    full_name: str = None
    position: str = None
    photo_url: str = None
    precinct_number: str = None
    district: str = None
    address: str = None
    schedule: str = None
    phone: str = None
    whatsapp: str = None
    streets: str = None
    description: str = None
    lat: float = None
    lng: float = None
    boundary_coords: str = None
    is_leadership: bool = None
    leadership_order: int = None
    created_at: str = None


class InspectorsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    full_name: Optional[str] = None
    position: Optional[str] = None
    photo_url: Optional[str] = None
    precinct_number: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    schedule: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    streets: Optional[str] = None
    description: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    boundary_coords: Optional[str] = None
    is_leadership: Optional[bool] = None
    leadership_order: Optional[int] = None
    created_at: Optional[str] = None


class InspectorsResponse(BaseModel):
    """Entity response schema"""
    id: int
    full_name: Optional[str] = None
    position: Optional[str] = None
    photo_url: Optional[str] = None
    precinct_number: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    schedule: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    streets: Optional[str] = None
    description: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    boundary_coords: Optional[str] = None
    is_leadership: Optional[bool] = None
    leadership_order: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class InspectorsListResponse(BaseModel):
    """List response schema"""
    items: List[InspectorsResponse]
    total: int
    skip: int
    limit: int


class InspectorsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[InspectorsData]


class InspectorsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: InspectorsUpdateData


class InspectorsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[InspectorsBatchUpdateItem]


class InspectorsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=InspectorsListResponse)
async def query_inspectorss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query inspectorss with filtering, sorting, and pagination"""
    logger.debug(f"Querying inspectorss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = InspectorsService(db)
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
        logger.debug(f"Found {result['total']} inspectorss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying inspectorss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=InspectorsListResponse)
async def query_inspectorss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query inspectorss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying inspectorss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = InspectorsService(db)
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
        logger.debug(f"Found {result['total']} inspectorss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying inspectorss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=InspectorsResponse)
async def get_inspectors(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single inspectors by ID"""
    logger.debug(f"Fetching inspectors with id: {id}, fields={fields}")
    
    service = InspectorsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Inspectors with id {id} not found")
            raise HTTPException(status_code=404, detail="Inspectors not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching inspectors {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=InspectorsResponse, status_code=201)
async def create_inspectors(
    data: InspectorsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new inspectors"""
    logger.debug(f"Creating new inspectors with data: {data}")
    
    service = InspectorsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create inspectors")
        
        logger.info(f"Inspectors created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating inspectors: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating inspectors: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[InspectorsResponse], status_code=201)
async def create_inspectorss_batch(
    request: InspectorsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple inspectorss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} inspectorss")
    
    service = InspectorsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} inspectorss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[InspectorsResponse])
async def update_inspectorss_batch(
    request: InspectorsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple inspectorss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} inspectorss")
    
    service = InspectorsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} inspectorss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=InspectorsResponse)
async def update_inspectors(
    id: int,
    data: InspectorsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing inspectors"""
    logger.debug(f"Updating inspectors {id} with data: {data}")

    service = InspectorsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Inspectors with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Inspectors not found")
        
        logger.info(f"Inspectors {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating inspectors {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating inspectors {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_inspectorss_batch(
    request: InspectorsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple inspectorss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} inspectorss")
    
    service = InspectorsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} inspectorss successfully")
        return {"message": f"Successfully deleted {deleted_count} inspectorss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_inspectors(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single inspectors by ID"""
    logger.debug(f"Deleting inspectors with id: {id}")
    
    service = InspectorsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Inspectors with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Inspectors not found")
        
        logger.info(f"Inspectors {id} deleted successfully")
        return {"message": "Inspectors deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting inspectors {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")