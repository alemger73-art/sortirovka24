import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.question_answers import Question_answers

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Question_answersService:
    """Service layer for Question_answers operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Question_answers]:
        """Create a new question_answers"""
        try:
            obj = Question_answers(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created question_answers with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating question_answers: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Question_answers]:
        """Get question_answers by ID"""
        try:
            query = select(Question_answers).where(Question_answers.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching question_answers {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of question_answerss"""
        try:
            query = select(Question_answers)
            count_query = select(func.count(Question_answers.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Question_answers, field):
                        query = query.where(getattr(Question_answers, field) == value)
                        count_query = count_query.where(getattr(Question_answers, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Question_answers, field_name):
                        query = query.order_by(getattr(Question_answers, field_name).desc())
                else:
                    if hasattr(Question_answers, sort):
                        query = query.order_by(getattr(Question_answers, sort))
            else:
                query = query.order_by(Question_answers.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching question_answers list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Question_answers]:
        """Update question_answers"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Question_answers {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated question_answers {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating question_answers {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete question_answers"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Question_answers {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted question_answers {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting question_answers {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Question_answers]:
        """Get question_answers by any field"""
        try:
            if not hasattr(Question_answers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Question_answers")
            result = await self.db.execute(
                select(Question_answers).where(getattr(Question_answers, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching question_answers by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Question_answers]:
        """Get list of question_answerss filtered by field"""
        try:
            if not hasattr(Question_answers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Question_answers")
            result = await self.db.execute(
                select(Question_answers)
                .where(getattr(Question_answers, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Question_answers.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching question_answerss by {field_name}: {str(e)}")
            raise