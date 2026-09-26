"""Publication must require an account and ignore forged moderation fields."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from routers.real_estate import Real_estateData, create_real_estate


@pytest.mark.asyncio
async def test_anonymous_cannot_create_listing():
    with patch('routers.real_estate.is_content_admin', AsyncMock(return_value=False)), \
         patch('routers.real_estate.resolve_account_user', AsyncMock(return_value=None)), \
         patch('routers.real_estate.Real_estateService.create', AsyncMock()) as create:
        with pytest.raises(HTTPException) as error:
            await create_real_estate(Real_estateData(title='Test'), None, AsyncMock())
        assert error.value.status_code == 401
        create.assert_not_awaited()


@pytest.mark.asyncio
async def test_author_cannot_choose_owner_status_or_promotion():
    with patch('routers.real_estate.is_content_admin', AsyncMock(return_value=False)), \
         patch('routers.real_estate.resolve_account_user', AsyncMock(return_value=SimpleNamespace(id='author'))), \
         patch('routers.real_estate.Real_estateService.create', AsyncMock(return_value=SimpleNamespace(id=1))) as create:
        await create_real_estate(Real_estateData(title='Test', description='Two rooms', phone='+77001234567', user_id='victim', status='approved', promotion_tier='vip'), 'Bearer test', AsyncMock())
        data = create.call_args.args[0]
        assert data['user_id'] == 'author'
        assert data['status'] == 'pending'
        assert data['promotion_tier'] is None


@pytest.mark.asyncio
async def test_content_admin_can_create_without_customer_account():
    with patch('routers.real_estate.is_content_admin', AsyncMock(return_value=True)), \
         patch('routers.real_estate.resolve_account_user', AsyncMock(return_value=None)), \
         patch('routers.real_estate.Real_estateService.create', AsyncMock(return_value=SimpleNamespace(id=1))) as create:
        await create_real_estate(Real_estateData(title='Test', status='approved'), 'Bearer admin', AsyncMock())
        assert create.call_args.args[0]['status'] == 'approved'
