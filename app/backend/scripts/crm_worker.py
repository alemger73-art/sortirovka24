"""Manual entrypoint, never started by the website. Run from app/backend."""
import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import update, select, func
from core.database import db_manager
from core.deploy_safety import validate_runtime_safety
from models.crm_delivery import CrmDelivery
from services.crm_delivery import HEADERS, deliver_one, delivery_allowed
from services.crm_transports import GoogleSheets, Telegram
import httpx


async def run(args):
    validate_runtime_safety()
    if not args.status and not delivery_allowed():
        raise SystemExit("CRM disabled: explicit S24_CRM_ENABLED and S24_CRM_SEND_ENABLED required")
    if not os.getenv("DATABASE_URL", "").startswith(("postgresql", "postgres://")):
        raise SystemExit("Worker requires PostgreSQL with row locks; no SQLite fallback")
    await db_manager.init_db()  # connects only; never creates/migrates tables
    try:
        if args.status:
            async with db_manager.async_session_maker() as db:
                counts = (await db.execute(select(
                    CrmDelivery.sheets_done, CrmDelivery.telegram_done, CrmDelivery.dead, func.count()
                ).group_by(CrmDelivery.sheets_done, CrmDelivery.telegram_done, CrmDelivery.dead))).all()
                for sheets_done, telegram_done, dead, count in counts:
                    print(f"sheets={sheets_done} telegram={telegram_done} dead={dead} count={count}")
            return
        if args.retry_id is not None:
            async with db_manager.async_session_maker() as db:
                await db.execute(update(CrmDelivery).where(CrmDelivery.id == args.retry_id).values(
                    attempts=0, dead=False, next_attempt_at=0, last_error=None))
                await db.commit()
            return
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            sheets, telegram = GoogleSheets(client), Telegram(client)
            if args.init_header:
                await sheets.write(1, HEADERS)
                return
            while True:
                for _ in range(100):
                    async with db_manager.async_session_maker() as db:
                        if not await deliver_one(db, sheets, telegram):
                            break
                if args.once:
                    return
                await asyncio.sleep(5)
    finally:
        await db_manager.engine.dispose()


if __name__ == "__main__":
    # httpx INFO logs contain Telegram tokens in URLs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--status", action="store_true")
    group.add_argument("--once", action="store_true")
    group.add_argument("--init-header", action="store_true")
    group.add_argument("--retry-id", type=int)
    try:
        asyncio.run(run(parser.parse_args()))
    except Exception as exc:
        # Sanitized process failure; supervisor should restart transient DB failures.
        print(f"CRM worker stopped: {type(exc).__name__}", file=sys.stderr)
        raise SystemExit(1) from None
