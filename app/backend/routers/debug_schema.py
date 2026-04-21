from fastapi import APIRouter
from core.database import db_manager
from sqlalchemy import text

router = APIRouter(prefix="/api/v1/debug", tags=["debug"])

@router.get("/schema/{table_name}")
async def get_table_schema(table_name: str):
    await db_manager.ensure_initialized()
    async with db_manager.engine.connect() as conn:
        result = await conn.execute(
            text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t ORDER BY ordinal_position"),
            {"t": table_name}
        )
        columns = [{"name": row[0], "type": row[1]} for row in result.fetchall()]
        return {"table": table_name, "columns": columns}

@router.get("/tables")
async def list_tables():
    await db_manager.ensure_initialized()
    async with db_manager.engine.connect() as conn:
        result = await conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
        )
        tables = [row[0] for row in result.fetchall()]
        return {"tables": tables}