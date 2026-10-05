"""Disposable local API for browser regression. Never imported by production."""
import asyncio
import tempfile
from pathlib import Path
import pytest
import uvicorn
from tests.test_dam_order_workflow import env, owner_headers
from models.food_orders import Food_orders
from services.bonus_rewards import handle_food_order_status_bonus as real_bonus_settlement


async def main():
    from models.banners import Banners  # register before fixture create_all
    patcher = pytest.MonkeyPatch()
    with tempfile.TemporaryDirectory(prefix='dam-payment-browser-') as directory:
        fixture = env.__wrapped__(patcher, Path(directory))
        client, maker, operator, _ = await anext(fixture)
        patcher.setattr("services.bonus_rewards.handle_food_order_status_bonus", real_bonus_settlement)
        app = client._transport.app
        # Exercise the real boundary middleware as well as router permissions.
        from middleware.entity_guard import EntityWriteGuardMiddleware
        async def middleware_db():
            async with maker() as db:
                yield db
        patcher.setattr('core.database.get_db', middleware_db)
        app.add_middleware(EntityWriteGuardMiddleware)
        from routers.dam_menu import router as menu_router
        app.include_router(menu_router)
        from routers.food_restaurants import router as restaurant_router
        from routers.food_settings import router as settings_router
        from routers.food_store import router as delivery_router
        app.include_router(restaurant_router);app.include_router(settings_router);app.include_router(delivery_router)
        from routers.delivery_catalog import router as catalog_router
        from routers.banners import router as banners_router
        app.include_router(catalog_router);app.include_router(banners_router)
        from routers.partner_auth import router as partner
        from routers.food_cashbox import router as cashbox
        app.include_router(partner)
        from routers.dam_workstation import router as workstation
        app.include_router(workstation)
        app.include_router(cashbox)
        from routers.account_v2 import router as account_router
        app.include_router(account_router)
        async with maker() as db:
            from models.food_items import Food_items
            from models.food_categories import Food_categories
            from models.food_settings import Food_settings
            from sqlalchemy import select
            # Browser checkout must not depend on the wall-clock time of the
            # test run. This setting belongs only to the disposable fixture DB.
            db.add(Food_settings(setting_key='working_hours', setting_value='00:00-23:59'))
            db.add(Food_settings(setting_key='delivery_price', setting_value='500'))
            for product in (await db.scalars(select(Food_items).where(Food_items.restaurant_id==1))).all(): product.business_id='dam_alem'
            db.add(Food_categories(id=1,restaurant_id=1,name='Основное меню',is_active=True,sort_order=1))
            (await db.get(Food_items,1)).category_id=1
            (await db.get(Food_items,2)).category_id=1
            db.add_all([Food_items(id=4,restaurant_id=1,business_id='dam_alem',category_id=1,name='Пепперони',price=3200,is_active=True,available=True),Food_items(id=5,restaurant_id=1,business_id='dam_alem',category_id=1,name='Фри',price=1500,is_active=True,available=True),Food_items(id=6,restaurant_id=1,business_id='dam_alem',category_id=1,name='Наггетсы',price=1800,is_active=True,available=True)])
            seed = await db.get(Food_orders, 1)
            seed.status = 'done'
            from models.partner_auth import PartnerCredentials
            from routers.partner_auth import _hash_password
            owner=await db.get(PartnerCredentials,2)
            owner.password_hash=_hash_password('LocalTestOnly2026!')
            from models.auth import User
            from models.user_management import UserSession
            from core.auth import create_access_token
            from services import loyalty as L, crm
            from tests.test_loyalty import order
            from datetime import timedelta
            user=User(id='a',phone='+77000000000',name='Тестовый клиент',phone_verified_at=L.now(),is_active=True,status='active')
            # Synthetic password login for checkout return regressions; no SMS.
            from routers.account_v2 import _hash_password as hash_account_password
            user.password_hash = hash_account_password('LocalCheckoutOnly2026!')
            db.add(user)
            db.add(UserSession(user_id='a',token_jti='local-crm-session',is_active=True,expires_at=L.now()+timedelta(days=1)))
            await db.flush()
            await crm.for_account(db,user)
            # Real backend settlement, no fake UI balance. Existing 1200 order is
            # a legacy fixture; this is the first order of the canonical account.
            first=await order(db,food=10000)
            await L.settle(db,first)
            client_token=create_access_token({'sub':'a','jti':'local-crm-session','role':'user'})
            await db.commit()

        @app.get('/__test__/sessions')
        async def sessions():
            return {'operator':operator['Authorization'][7:], 'owner':owner_headers()['Authorization'][7:], 'client':client_token}

        @app.post('/__test__/reset-rate-limits')
        async def reset_limits():
            from utils.rate_limit import _RATE_BUCKETS
            _RATE_BUCKETS.clear()
            return {'ok': True}

        @app.get('/api/v1/modules')
        async def modules():
            return {'food':True, 'dam_alem':True, 'account':True}

        try:
            await uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=3188, log_level='warning')).serve()
        finally:
            await fixture.aclose()
            patcher.undo()


if __name__ == '__main__':
    asyncio.run(main())
