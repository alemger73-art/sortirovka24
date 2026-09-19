import json
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base, db_manager
from models.food_restaurants import Food_restaurants
from models.food_items import Food_items
from models.food_settings import Food_settings
from models.banners import Banners
from services.dam_alem_marketing_seed import ensure_dam_alem_marketing
from services.food_restaurants import Food_restaurantsService
from services.food_operations import brand


@pytest.mark.asyncio
async def test_migration_preserves_photos_prices_and_owner_edits_on_restart(monkeypatch):
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as c:
        await c.run_sync(lambda conn: Base.metadata.create_all(conn,tables=[x.__table__ for x in [Food_restaurants,Food_items,Food_settings,Banners]]))
    maker=async_sessionmaker(engine,expire_on_commit=False)
    monkeypatch.setattr(db_manager,'async_session_maker',maker)
    monkeypatch.delenv('DAM_ALEM_SEED_MARKETING',raising=False)
    async with maker() as db:
        db.add(Food_restaurants(id=1,name='Däm Әлемі'))
        db.add_all([Food_items(id=1,restaurant_id=1,name='Комбо куриный',price=3700,is_combo=True,is_active=True,image_url='owner-photo'),
            Food_items(id=2,restaurant_id=1,name='Coca-Cola',price=0,is_active=True)])
        db.add(Banners(title='Old promo',button_url='/food#promo=OLD',banner_type='food_delivery',active=True))
        await db.commit()
    await ensure_dam_alem_marketing()
    async with maker() as db:
        assert (await db.get(Food_items,1)).image_url=='owner-photo'
        assert (await db.get(Food_items,1)).price==3700
        assert not (await db.get(Food_items,2)).is_active
        active=(await db.scalars(select(Banners).where(Banners.active.is_(True)))).all()
        assert len(active)==1 and active[0].button_url=='/food#product=1'
        gift=await db.scalar(select(Food_settings).where(Food_settings.setting_key=='loyalty_gifts'))
        assert {g['min_amount'] for g in json.loads(gift.setting_value)}=={11000}
        gift.setting_value='[]'
        active[0].title='Owner combo name'
        await db.commit()
        await Food_restaurantsService(db).update(1,{'name':'New name'})
        restaurant=await db.get(Food_restaurants,1)
        assert brand(restaurant.name,restaurant.merchant_key)
    await ensure_dam_alem_marketing()
    async with maker() as db:
        gift=await db.scalar(select(Food_settings).where(Food_settings.setting_key=='loyalty_gifts'))
        assert gift.setting_value=='[]'
        active=(await db.scalars(select(Banners).where(Banners.active.is_(True)))).all()
        assert len(active)==1 and active[0].title=='Owner combo name'
    await engine.dispose()
