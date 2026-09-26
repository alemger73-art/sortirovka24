import os
import unittest
from decimal import Decimal
from unittest.mock import patch

from services.frontpad_client import call_frontpad
from services.payment import CheckoutError, CheckoutSessionRequest, PaymentService, initialize_stripe
from services.push_notifications import push_enabled, send_push_to_token
from services.sms import SMSDeliveryResult, send_verification_code, should_expose_code_on_screen
from services.telegram import send_telegram_message


class ExternalSideEffectTests(unittest.IsolatedAsyncioTestCase):
    async def test_pending_provider_never_exposes_code_in_production(self):
        result = SMSDeliveryResult(delivered=False, pending_moderation=True)
        with patch.dict(
            os.environ,
            {"DEBUG": "false", "SMS_EXPOSE_CODE": "false"},
            clear=True,
        ):
            self.assertFalse(should_expose_code_on_screen(result))

    async def test_disabled_environment_skips_message_delivery(self):
        env = {
            "EXTERNAL_SIDE_EFFECTS": "disabled",
            "TELEGRAM_BOT_TOKEN": "must-not-be-used",
            "TELEGRAM_CHAT_ID": "must-not-be-used",
            "SMS_PROVIDER": "mobizon",
            "MOBIZON_API_KEY": "must-not-be-used",
            "FCM_SERVER_KEY": "must-not-be-used",
        }
        with patch.dict(os.environ, env, clear=True):
            self.assertFalse(await send_telegram_message("test"))
            sms = await send_verification_code("+77000000000", "1234")
            self.assertEqual(sms.provider_message, "external_side_effects_disabled")
            self.assertFalse(push_enabled())
            self.assertFalse(await send_push_to_token("token", title="test", body="test"))

    async def test_disabled_environment_rejects_frontpad_and_payment(self):
        request = CheckoutSessionRequest(
            amount=Decimal("100"),
            currency="kzt",
            success_url="https://stage.example/success/{CHECKOUT_SESSION_ID}",
            cancel_url="https://stage.example/cancel",
        )
        with patch.dict(os.environ, {"EXTERNAL_SIDE_EFFECTS": "disabled"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "FrontPad integration is disabled"):
                await call_frontpad("secret", "new_order")
            await initialize_stripe()
            with self.assertRaises(CheckoutError) as raised:
                await PaymentService().create_checkout_session(request)
            self.assertEqual(raised.exception.error_type, "environment_disabled")
            with self.assertRaises(CheckoutError) as status_error:
                await PaymentService().get_checkout_status("cs_test_must_not_be_used")
            self.assertEqual(status_error.exception.error_type, "environment_disabled")


if __name__ == "__main__":
    unittest.main()
