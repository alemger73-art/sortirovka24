"""Free Telegram login codes: site asks → bot link → shared contact → code in bot → sign-in."""
import json
import os
import re
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import tests.test_quick_account_auth as base
from routers import account_v2 as account
from services import news_agent, sms, telegram_login


class TelegramBotLoginTests(base.QuickAccountAuthTests):
    # Reuse the base setup only; its own tests run in their own module.
    locals().update({n: None for n in dir(base.QuickAccountAuthTests) if n.startswith("test_")})

    async def asyncSetUp(self):
        await super().asyncSetUp()
        for p in self.patches:
            if getattr(p, "attribute", None) == "send_verification_code":
                p.stop()
        self.extra = [patch.dict(os.environ, {"NEWS_TELEGRAM_BOT_TOKEN": "1:t", "NEWS_TELEGRAM_CHAT_ID": "555",
                                              "SMS_PROVIDER": "", "TELEGRAM_GATEWAY_TOKEN": ""}),
                      patch.object(telegram_login, "bot_username", AsyncMock(return_value="s24bot"))]
        for p in self.extra:
            p.start()
        self.sent = []

        def handler(request):
            self.sent.append((str(request.url).rsplit("/", 1)[-1], json.loads(request.content or b"{}")))
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})
        self.tg = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    async def asyncTearDown(self):
        await self.tg.aclose()
        for p in reversed(self.extra):
            p.stop()
        self.patches = [p for p in self.patches if getattr(p, "attribute", None) != "send_verification_code"]
        await super().asyncTearDown()

    async def ask(self, phone="+77001234567"):
        r = await self.client.post("/api/v1/account/signin/request-sms", json={
            "phone": phone, "channel": "telegram", "legal_version": "2026-10-19", "legal_subject_name": "Тест Тестов",
            "agreement_accepted": True, "privacy_accepted": True})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    async def share(self, phone="77001234567", owner=42, sender=42):
        async with self.sessions() as db:
            await news_agent.handle_update(db, self.tg, {"message": {
                "message_id": 3, "chat": {"id": sender, "type": "private"}, "from": {"id": sender},
                "contact": {"phone_number": phone, "user_id": owner}}})
        return self.sent[-1][1]["text"]

    async def test_full_flow(self):
        self.assertIn("telegram", sms.available_channels())
        body = await self.ask()
        self.assertEqual(body["bot_url"], "https://t.me/s24bot?start=code")
        self.assertIsNone(body["debug_code"])
        # Deep link /start code → bot asks for the number.
        async with self.sessions() as db:
            await news_agent.handle_update(db, self.tg, {"message": {
                "message_id": 1, "chat": {"id": 42, "type": "private"}, "from": {"id": 42}, "text": "/start code"}})
        self.assertTrue(self.sent[-1][1]["reply_markup"]["keyboard"][0][0]["request_contact"])
        text = await self.share()
        code = re.search(r"<b>(\d{6})</b>", text).group(1)
        result = await self.confirm(code)
        self.assertEqual(result.status_code, 200, result.text)

    async def test_someone_elses_contact_or_no_request(self):
        await self.ask()
        self.assertIn("своим номером", await self.share(owner=99))
        self.assertIn("не запрошен", await self.share(phone="77009999999"))

    async def test_plain_start_from_customer_shows_login_help(self):
        async with self.sessions() as db:
            await news_agent.handle_update(db, self.tg, {"message": {
                "message_id": 1, "chat": {"id": 42, "type": "private"}, "from": {"id": 42}, "text": "/start"}})
        self.assertIn("Поделиться номером", self.sent[-1][1]["text"])
