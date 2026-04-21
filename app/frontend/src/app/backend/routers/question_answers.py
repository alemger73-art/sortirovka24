import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.question_answers import Question_answersService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/question_answers", tags=["question_answers"])


# ---------- Pydantic Schemas ----------
class Question_answersData(BaseModel):
    """Entity data schema (for create/update)"""
    question_id: int
    answer_text: str
    author_name: str = None
    created_at: Optional[datetime] = None


class Question_answersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    question_id: Optional[int] = None
    answer_text: Optional[str] = None
    author_name: Optional[str] = None
    created_at: Optional[datetime] = None


class Question_answersResponse(BaseModel):
    """Entity response schema"""
    id: int
    question_id: int
    answer_text: str
    author_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Question_answersListResponse(BaseModel):
    """List response schema"""
    items: List[Question_answersResponse]
    total: int
    skip: int
    limit: int


class Question_answersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Question_answersData]


class Question_answersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Question_answersUpdateData


class Question_answersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Question_answersBatchUpdateItem]


class Question_answersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Question_answersListResponse)
async def query_question_answerss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query question_answerss with filtering, sorting, and pagination"""
    logger.debug(f"Querying question_answerss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Question_answersService(db)
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
        logger.debug(f"Found {result['total']} question_answerss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying question_answerss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Question_answersListResponse)
async def query_question_answerss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query question_answerss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying question_answerss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Question_answersService(db)
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
        logger.debug(f"Found {result['total']} question_answerss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying question_answerss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Question_answersResponse)
async def get_question_answers(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single question_answers by ID"""
    logger.debug(f"Fetching question_answers with id: {id}, fields={fields}")
    
    service = Question_answersService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Question_answers with id {id} not found")
            raise HTTPException(status_code=404, detail="Question_answers not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching question_answers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Question_answersResponse, status_code=201)
async def create_question_answers(
    data: Question_answersData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new question_answers"""
    logger.debug(f"Creating new question_answers with data: {data}")
    
    service = Question_answersService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create question_answers")
        
        logger.info(f"Question_answers created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating question_answers: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating question_answers: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Question_answersResponse], status_code=201)
async def create_question_answerss_batch(
    request: Question_answersBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple question_answerss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} question_answerss")
    
    service = Question_answersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} question_answerss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Question_answersResponse])
async def update_question_answerss_batch(
    request: Question_answersBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple question_answerss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} question_answerss")
    
    service = Question_answersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} question_answerss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Question_answersResponse)
async def update_question_answers(
    id: int,
    data: Question_answersUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing question_answers"""
    logger.debug(f"Updating question_answers {id} with data: {data}")

    service = Question_answersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Question_answers with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Question_answers not found")
        
        logger.info(f"Question_answers {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating question_answers {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating question_answers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_question_answerss_batch(
    request: Question_answersBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple question_answerss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} question_answerss")
    
    service = Question_answersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} question_answerss successfully")
        return {"message": f"Successfully deleted {deleted_count} question_answerss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_question_answers(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single question_answers by ID"""
    logger.debug(f"Deleting question_answers with id: {id}")
    
    service = Question_answersService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Question_answers with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Question_answers not found")
        
        logger.info(f"Question_answers {id} deleted successfully")
        return {"message": "Question_answers deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting question_answers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")