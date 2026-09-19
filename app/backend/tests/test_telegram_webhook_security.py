from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from core.database import get_db
from routers.telegram_webhook import router


@pytest.mark.asyncio
async def test_webhook_requires_secret_chat_and_sender(monkeypatch):
    app = FastAPI(); app.include_router(router)
    db = AsyncMock()
    async def dependency():
        yield db
    app.dependency_overrides[get_db] = dependency
    handler = AsyncMock(return_value='ok')
    monkeypatch.setattr('routers.telegram_webhook.handle_food_callback', handler)
    monkeypatch.setattr('routers.telegram_webhook.answer_callback_query', AsyncMock())
    monkeypatch.delenv('TELEGRAM_WEBHOOK_SECRET', raising=False)
    callback={'callback_query':{'id':'x','data':'fo_confirm:1','from':{'id':12},'message':{'chat':{'id':-100123}}}}
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        async def send(headers=None, body=None):
            return await client.post('/api/v1/telegram/webhook',json=body or callback,headers=headers)
        assert (await send()).status_code==503
        monkeypatch.setenv('TELEGRAM_WEBHOOK_SECRET','secret-test')
        assert (await send()).status_code==403
        headers={'X-Telegram-Bot-Api-Secret-Token':'secret-test'}
        assert (await send(headers)).status_code==403
        monkeypatch.setenv('TELEGRAM_CALLBACK_CHAT_IDS','-100123')
        monkeypatch.setenv('TELEGRAM_CALLBACK_USER_IDS','99')
        assert (await send(headers)).status_code==403
        handler.assert_not_awaited()
        monkeypatch.setenv('TELEGRAM_CALLBACK_USER_IDS','12')
        assert (await send(headers)).status_code==200
        handler.assert_awaited_once()
        assert (await send(headers, {'callback_query':['invalid']})).status_code==400


@pytest.mark.asyncio
@pytest.mark.parametrize('action', ['fcd_done','fcd_cash','fcd_pick','fcd_way'])
async def test_legacy_buttons_cannot_mutate_dam_order_or_delivery(monkeypatch, action):
    from types import SimpleNamespace
    from services.food_telegram_flow import handle_food_callback
    task=SimpleNamespace(id=1,source_type='food_orders',source_id=3,status='ready')
    order=SimpleNamespace(id=3,status='ready',payment_status='pending')
    monkeypatch.setattr('services.logistics_service.get_task_by_id',AsyncMock(return_value=task))
    monkeypatch.setattr('services.food_orders.Food_ordersService.get_by_id',AsyncMock(return_value=order))
    monkeypatch.setattr('services.food_operations.is_dam_order',AsyncMock(return_value=True))
    db=AsyncMock()
    result=await handle_food_callback(db,action+':1')
    assert 'кабинет' in result
    assert task.status=='ready' and order.payment_status=='pending'
    db.commit.assert_not_awaited()
