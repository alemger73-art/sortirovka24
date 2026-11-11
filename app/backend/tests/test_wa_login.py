"""WhatsApp sign-in where the person writes first: the site sends nothing, the person sends
«Вход на Сортировка 24: 1234» from the number typed on the site, the page polls and signs in."""
import json
import os
import re
import time
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import httpx
from sqlalchemy import text

import tests.test_quick_account_auth as base
from core.database import db_manager
from models.auth import User
from services import sms, support_bot, wa_guard, wa_login

PHONE = "+77001234567"


class WhatsAppLoginTests(base.QuickAccountAuthTests):
    # Reuse the base setup only; its own tests run in their own module.
    locals().update({n: None for n in dir(base.QuickAccountAuthTests) if n.startswith("test_")})

    async def asyncSetUp(self):
        await super().asyncSetUp()
        support_bot._chats.clear(); support_bot._seen_ids.clear(); support_bot._aliases.clear()
        wa_guard.reset()
        sms._waha_state.update(working=True, checked=time.monotonic())
        self.extra = [patch.dict(os.environ, {"WAHA_URL": "http://waha:3000", "WAHA_API_KEY": "k", "ANTHROPIC_API_KEY": "x",
                                              "NEWS_TELEGRAM_BOT_TOKEN": "", "TELEGRAM_GATEWAY_TOKEN": ""}),
                      patch.object(support_bot, "REPLY_GRACE_SECONDS", 0),
                      patch.object(db_manager, "async_session_maker", self.sessions)]
        for p in self.extra:
            p.start()
        self.log = []

        def handler(request):
            self.log.append((str(request.url), json.loads(request.content or b"{}")))
            if "anthropic" in str(request.url):
                return httpx.Response(200, json={"content": [{"type": "text", "text": "ответ ИИ"}]})
            return httpx.Response(200, json={"ok": True})
        self.wa = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    async def asyncTearDown(self):
        await self.wa.aclose()
        for p in reversed(self.extra):
            p.stop()
        wa_guard.reset()
        sms._waha_state.update(working=False, checked=0.0)
        await super().asyncTearDown()

    async def start(self, phone=PHONE):
        r = await self.client.post("/api/v1/account/signin/request-sms", json={
            "phone": phone, "channel": "whatsapp", "legal_version": "2026-10-09", "legal_subject_name": "Асия",
            "agreement_accepted": True, "privacy_accepted": True})
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        message = parse_qs(urlparse(body["wa_url"]).query)["text"][0]
        self.assertTrue(body["wa_url"].startswith("https://wa.me/77004280280?text="))
        return body["login_id"], re.fullmatch(r"Вход на Сортировка 24: (\d{4})", message).group(1)

    async def status(self, login_id, accepted=True):
        body = {"login_id": login_id, "agreement_accepted": accepted, "privacy_accepted": accepted}
        if accepted:
            body.update(legal_version="2026-10-09", legal_subject_name="Асия")
        return await self.client.post("/api/v1/account/signin/whatsapp/status", json=body)

    async def write(self, code, *, sender="77001234567@c.us", info=None, mid=None):
        payload = {"id": mid or f"m-{code}-{sender}", "from": sender, "to": "77004280280@c.us", "fromMe": False,
                   "body": f"Вход на Сортировка 24: {code}", "_data": {"pushName": "Асия", "Info": info or {}}}
        return await support_bot.handle_event({"event": "message", "payload": payload}, self.wa)

    def sent(self):
        return [b for u, b in self.log if u.endswith("/sendText")]

    async def test_happy_path_creates_user_with_bonus(self):
        login_id, code = await self.start()
        self.assertEqual(self.sent(), [])  # nothing is sent to the person first
        self.assertEqual((await self.status(login_id)).json(), {"status": "pending"})
        out = await self.write(code)
        self.assertEqual(out.action, "login")
        self.assertEqual(self.sent(), [{"session": "default", "chatId": "77001234567@c.us", "text": wa_login.DONE}])
        self.assertFalse(any("anthropic" in u for u, _ in self.log))  # never handed to the AI
        self.assertEqual(support_bot._chat("77001234567@c.us").turns, [])
        r = await self.status(login_id)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["status"], "done")
        self.assertTrue(r.json()["token"])
        async with self.sessions() as db:
            user = await db.get(User, r.json()["user_id"])
            self.assertEqual(user.phone, PHONE)
            self.assertIsNotNone(user.phone_verified_at)
            self.assertEqual(float(user.bonus_balance), 300)
        self.assertEqual((await self.status(login_id)).status_code, 410)  # used once
        # The reply echoes back as fromMe: it must not mute the chat (owner takeover).
        echo = {"id": "echo", "from": "77004280280@c.us", "to": "77001234567@c.us", "fromMe": True, "body": wa_login.DONE}
        self.assertEqual((await support_bot.handle_event({"event": "message.any", "payload": echo}, self.wa)).action, "ignored")

    async def test_sending_twice_gets_one_reply(self):
        _, code = await self.start()
        await self.write(code, mid="a")
        await self.write(code, mid="b")
        self.assertEqual([m["text"] for m in self.sent()], [wa_login.DONE])

    async def test_wrong_sender_phone_is_refused(self):
        login_id, code = await self.start()
        out = await self.write(code, sender="77019998877@c.us")
        self.assertEqual(out.reply, wa_login.WRONG_NUMBER)
        self.assertEqual((await self.status(login_id)).json(), {"status": "pending"})

    async def test_expired(self):
        login_id, code = await self.start()
        async with self.sessions() as db:
            await db.execute(text("UPDATE wa_logins SET expires_at = :t"), {"t": int(time.time()) - 1})
            await db.commit()
        self.assertEqual((await self.write(code)).reply, wa_login.EXPIRED)
        self.assertEqual((await self.status(login_id)).status_code, 410)

    async def test_lid_sender_resolved_through_sender_alt(self):
        login_id, code = await self.start()
        out = await self.write(code, sender="123456789012345@lid",
                               info={"Sender": "123456789012345@lid", "SenderAlt": "77001234567@s.whatsapp.net"})
        self.assertEqual(out.reply, wa_login.DONE)
        self.assertEqual((await self.status(login_id)).json()["status"], "done")

    async def test_lid_without_number_fails_safely(self):
        login_id, code = await self.start()
        out = await self.write(code, sender="77001234567@lid", info={"Sender": "77001234567@lid"})
        self.assertEqual(out.reply, wa_login.NO_NUMBER)
        self.assertEqual((await self.status(login_id)).json(), {"status": "pending"})

    async def test_new_user_needs_consent(self):
        login_id, code = await self.start()
        await self.write(code)
        self.assertEqual((await self.status(login_id, accepted=False)).status_code, 400)

    async def test_channels_offer_whatsapp_for_sign_in_only(self):
        self.assertIn("whatsapp", (await self.client.get("/api/v1/account/otp-channels?purpose=signin")).json()["channels"])
        self.assertNotIn("whatsapp", (await self.client.get("/api/v1/account/otp-channels")).json()["channels"])
        wa_guard._fuse["down"] = True
        self.assertNotIn("whatsapp", (await self.client.get("/api/v1/account/otp-channels?purpose=signin")).json()["channels"])
        r = await self.client.post("/api/v1/account/signin/request-sms", json={
            "phone": PHONE, "channel": "whatsapp", "agreement_accepted": True, "privacy_accepted": True,
            "legal_version": "2026-10-09", "legal_subject_name": "Асия"})
        self.assertEqual(r.status_code, 422)
        self.assertIn("Telegram", r.json()["detail"])

    def test_message_pattern(self):
        self.assertEqual(wa_login.login_code("Вход на Сортировка 24: 4821"), "4821")
        self.assertEqual(wa_login.login_code("вход на «Сортировка 24» 0042"), "0042")
        self.assertIsNone(wa_login.login_code("как войти на сортировка 24?"))
