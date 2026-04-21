import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.jobs import JobsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/jobs", tags=["jobs"])


# ---------- Pydantic Schemas ----------
class JobsData(BaseModel):
    """Entity data schema (for create/update)"""
    job_title: str = None
    employer: str = None
    category: str = None
    description: str = None
    salary: str = None
    schedule: str = None
    district: str = None
    phone: str = None
    whatsapp: str = None
    telegram: str = None
    image_url: str = None
    active: bool = None
    status: str = None
    created_at: str = None


class JobsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    job_title: Optional[str] = None
    employer: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    schedule: Optional[str] = None
    district: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    telegram: Optional[str] = None
    image_url: Optional[str] = None
    active: Optional[bool] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class JobsResponse(BaseModel):
    """Entity response schema"""
    id: int
    job_title: Optional[str] = None
    employer: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    schedule: Optional[str] = None
    district: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    telegram: Optional[str] = None
    image_url: Optional[str] = None
    active: Optional[bool] = None
    status: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class JobsListResponse(BaseModel):
    """List response schema"""
    items: List[JobsResponse]
    total: int
    skip: int
    limit: int


class JobsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[JobsData]


class JobsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: JobsUpdateData


class JobsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[JobsBatchUpdateItem]


class JobsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=JobsListResponse)
async def query_jobss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query jobss with filtering, sorting, and pagination"""
    logger.debug(f"Querying jobss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = JobsService(db)
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
        logger.debug(f"Found {result['total']} jobss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying jobss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=JobsListResponse)
async def query_jobss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query jobss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying jobss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = JobsService(db)
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
        logger.debug(f"Found {result['total']} jobss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying jobss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=JobsResponse)
async def get_jobs(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single jobs by ID"""
    logger.debug(f"Fetching jobs with id: {id}, fields={fields}")
    
    service = JobsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Jobs with id {id} not found")
            raise HTTPException(status_code=404, detail="Jobs not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching jobs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=JobsResponse, status_code=201)
async def create_jobs(
    data: JobsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new jobs"""
    logger.debug(f"Creating new jobs with data: {data}")
    
    service = JobsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create jobs")
        
        logger.info(f"Jobs created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating jobs: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating jobs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[JobsResponse], status_code=201)
async def create_jobss_batch(
    request: JobsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple jobss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} jobss")
    
    service = JobsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} jobss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[JobsResponse])
async def update_jobss_batch(
    request: JobsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple jobss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} jobss")
    
    service = JobsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} jobss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=JobsResponse)
async def update_jobs(
    id: int,
    data: JobsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing jobs"""
    logger.debug(f"Updating jobs {id} with data: {data}")

    service = JobsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Jobs with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Jobs not found")
        
        logger.info(f"Jobs {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating jobs {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating jobs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_jobss_batch(
    request: JobsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple jobss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} jobss")
    
    service = JobsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} jobss successfully")
        return {"message": f"Successfully deleted {deleted_count} jobss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_jobs(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single jobs by ID"""
    logger.debug(f"Deleting jobs with id: {id}")
    
    service = JobsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Jobs with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Jobs not found")
        
        logger.info(f"Jobs {id} deleted successfully")
        return {"message": "Jobs deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting jobs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")