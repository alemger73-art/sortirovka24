"""Bank adapter boundary. No fabricated live Kaspi/Halyk protocol."""
import hashlib
import hmac
import os
from typing import Protocol
from fastapi import HTTPException
from pydantic import BaseModel, Field
from typing import Literal


class Confirmation(BaseModel):
    model_config = {'extra': 'forbid'}
    event_id: str = Field(min_length=1, max_length=120)
    payment_id: str = Field(min_length=1, max_length=36)
    external_id: str = Field(min_length=1, max_length=255)
    provider: Literal['KASPI', 'HALYK']
    amount: str = Field(max_length=30)
    currency: Literal['KZT']
    status: Literal['WAITING', 'PAID', 'FAILED', 'EXPIRED']


class PaymentProvider(Protocol):
    def verify(self, body: bytes, signature: str) -> dict: ...
    async def initiate(self, payment) -> dict: ...
    async def check(self, external_id: str) -> dict: ...


class MockProvider:
    """Deterministic adapter for tests only; never selected by a live deployment."""
    def __init__(self, secret: str):
        self.secret = secret

    def verify(self, body: bytes, signature: str) -> dict:
        expected = hmac.new(self.secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(401, 'Неверная подпись платежа')
        return Confirmation.model_validate_json(body).model_dump()

    async def initiate(self, payment) -> dict:
        return {'external_id': f'mock-{payment.id}', 'status': 'WAITING'}

    async def check(self, external_id: str) -> dict:
        return {'external_id': external_id, 'status': 'WAITING'}


def configured_adapter():
    # Explicit triple guard, including no Railway runtime. Test credentials
    # cannot accidentally enable a fake payment endpoint in production.
    if (os.getenv('APP_ENV') == 'test' and os.getenv('EXTERNAL_SIDE_EFFECTS') == 'disabled'
            and not os.getenv('RAILWAY_ENVIRONMENT_ID') and os.getenv('PAYMENT_TEST_SECRET')):
        return MockProvider(os.environ['PAYMENT_TEST_SECRET'])
    raise HTTPException(503, 'Автоматическая оплата ещё не подключена')
