import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.become_master_requests import Become_master_requests
from services.become_master_requests import Become_master_requestsService
from services.telegram import notify_new_become_master
from services.user_notifications import notify_become_master_decision
from utils.phone import normalize_phone, matches_phone
from utils.rate_limit import check_ip_rate_limit

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/become_master_requests", tags=["become_master_requests"])


# ---------- Pydantic Schemas ----------
class Become_master_requestsData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str = None
    category: str = None
    phone: str = None
    whatsapp: str = None
    district: str = None
    photo_url: str = None
    gallery_images: str = None
    description: str = None
    status: str = None
    created_at: str = None


class Become_master_requestsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    district: Optional[str] = None
    photo_url: Optional[str] = None
    gallery_images: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class Become_master_requestsResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    district: Optional[str] = None
    photo_url: Optional[str] = None
    gallery_images: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Become_master_requestsListResponse(BaseModel):
    """List response schema"""
    items: List[Become_master_requestsResponse]
    total: int
    skip: int
    limit: int


class Become_master_requestsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Become_master_requestsData]


class Become_master_requestsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Become_master_requestsUpdateData


class Become_master_requestsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Become_master_requestsBatchUpdateItem]


class Become_master_requestsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Become_master_requestsListResponse)
async def query_become_master_requestss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query become_master_requestss with filtering, sorting, and pagination"""
    logger.debug(f"Querying become_master_requestss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Become_master_requestsService(db)
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
        logger.debug(f"Found {result['total']} become_master_requestss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying become_master_requestss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Become_master_requestsListResponse)
async def query_become_master_requestss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query become_master_requestss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying become_master_requestss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Become_master_requestsService(db)
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
        logger.debug(f"Found {result['total']} become_master_requestss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying become_master_requestss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Become_master_requestsResponse)
async def get_become_master_requests(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single become_master_requests by ID"""
    logger.debug(f"Fetching become_master_requests with id: {id}, fields={fields}")
    
    service = Become_master_requestsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Become_master_requests with id {id} not found")
            raise HTTPException(status_code=404, detail="Become_master_requests not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching become_master_requests {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Become_master_requestsResponse, status_code=201)
async def create_become_master_requests(
    data: Become_master_requestsData,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new become_master_requests"""
    check_ip_rate_limit(request, key_prefix="become_master_requests", max_hits=5)
    logger.debug(f"Creating new become_master_requests with data: {data}")

    payload = data.model_dump()
    if payload.get("phone"):
        payload["phone"] = normalize_phone(payload["phone"]) or payload["phone"]
    if payload.get("whatsapp"):
        payload["whatsapp"] = normalize_phone(payload["whatsapp"]) or payload["whatsapp"]
    pending_rows = (
        await db.execute(
            select(Become_master_requests).where(Become_master_requests.status == "pending").limit(300)
        )
    ).scalars().all()
    if payload.get("phone") and any(matches_phone(r.phone, payload["phone"]) for r in pending_rows):
        raise HTTPException(status_code=400, detail="У вас уже есть заявка на рассмотрении. Дождитесь ответа администратора.")
    
    service = Become_master_requestsService(db)
    try:
        result = await service.create(payload)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create become_master_requests")
        
        try:
            await notify_new_become_master(payload)
        except Exception as notify_err:
            logger.warning(f"Telegram notify skipped: {notify_err}")

        try:
            from services.admin_alerts import alert_new_become_master

            await alert_new_become_master(db, payload)
        except Exception as admin_push_err:
            logger.warning(f"Admin push notify skipped: {admin_push_err}")
        
        logger.info(f"Become_master_requests created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating become_master_requests: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating become_master_requests: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Become_master_requestsResponse], status_code=201)
async def create_become_master_requestss_batch(
    request: Become_master_requestsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple become_master_requestss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} become_master_requestss")
    
    service = Become_master_requestsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} become_master_requestss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Become_master_requestsResponse])
async def update_become_master_requestss_batch(
    request: Become_master_requestsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple become_master_requestss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} become_master_requestss")
    
    service = Become_master_requestsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} become_master_requestss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Become_master_requestsResponse)
async def update_become_master_requests(
    id: int,
    data: Become_master_requestsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing become_master_requests"""
    logger.debug(f"Updating become_master_requests {id} with data: {data}")

    service = Become_master_requestsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        existing = await service.get_by_id(id)
        old_status = getattr(existing, "status", None) if existing else None
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Become_master_requests with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Become_master_requests not found")

        new_status = getattr(result, "status", None)
        if new_status and new_status != old_status and new_status in {"approved", "rejected"}:
            try:
                await notify_become_master_decision(db, result, new_status)
            except Exception as notify_err:
                logger.warning(f"Become-master push notify skipped: {notify_err}")
        
        logger.info(f"Become_master_requests {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating become_master_requests {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating become_master_requests {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_become_master_requestss_batch(
    request: Become_master_requestsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple become_master_requestss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} become_master_requestss")
    
    service = Become_master_requestsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} become_master_requestss successfully")
        return {"message": f"Successfully deleted {deleted_count} become_master_requestss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_become_master_requests(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single become_master_requests by ID"""
    logger.debug(f"Deleting become_master_requests with id: {id}")
    
    service = Become_master_requestsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Become_master_requests with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Become_master_requests not found")
        
        logger.info(f"Become_master_requests {id} deleted successfully")
        return {"message": "Become_master_requests deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting become_master_requests {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")