import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from models.news import News
from services.news import NewsService


def test_public_news_search_pagination_and_wildcards():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(News.__table__.create)
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            db.add_all([
                News(id=1, title="Park opens", content="A district event", published=True, category="Events", created_at="2026-09-27"),
                News(id=2, title="Hidden park", content="Secret", published=False, category="Events", created_at="2026-09-27"),
                News(id=3, title="Another park", content="Discount 20%", published=True, category="Events", created_at="2026-09-27"),
            ])
            await db.commit()
            service = NewsService(db)
            page = await service.get_list(query_dict={"search": "PARK"}, public_only=True, sort="-created_at", limit=1)
            assert page["total"] == 2
            assert page["items"][0].id == 3
            next_page = await service.get_list(query_dict={"search": "park"}, public_only=True, sort="-created_at", limit=1, skip=1)
            assert next_page["items"][0].id == 1
            literal = await service.get_list(query_dict={"search": "%"}, public_only=True)
            assert literal["total"] == 1
            assert literal["items"][0].id == 3
            missing = await service.get_list(query_dict={"search": "Secret"}, public_only=True)
            assert missing["total"] == 0
        await engine.dispose()
    asyncio.run(run())
