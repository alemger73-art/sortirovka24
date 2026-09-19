import os
import unittest
from unittest.mock import patch

from core.deploy_safety import (
    database_target_fingerprint,
    external_side_effects_allowed,
    staging_safety_errors,
    validate_runtime_safety,
)


SAFE_STAGING = {
    "ENVIRONMENT": "staging",
    "DATABASE_URL": "postgresql+asyncpg://stage:secret@stage-db.internal:5432/railway",
    "STAGING_DATABASE_HOST": "stage-db.internal",
    "STAGING_BASE_URL": "https://sortirovka24-stage.up.railway.app",
    "PUBLIC_FRONTEND_URL": "https://sortirovka24-stage.up.railway.app",
    "EXTERNAL_SIDE_EFFECTS": "disabled",
    "WHATSAPP_BOT_ENABLED": "false",
    "FRONTPAD_AUTO_PUSH_ORDERS": "false",
    "FRONTPAD_SYNC_ON_START": "false",
}


class DeploySafetyTests(unittest.TestCase):
    def test_safe_staging_contract_passes(self):
        with patch.dict(os.environ, SAFE_STAGING, clear=True):
            self.assertEqual(staging_safety_errors(), [])
            validate_runtime_safety()

    def test_staging_rejects_production_targets_and_real_integrations(self):
        unsafe = {
            **SAFE_STAGING,
            "DATABASE_URL": "postgresql+asyncpg://prod:secret@prod-db.internal:5432/railway",
            "STAGING_BASE_URL": "https://sortirovka24-production-8788.up.railway.app",
            "PUBLIC_FRONTEND_URL": "https://sortirovka24-production-8788.up.railway.app",
            "FRONTPAD_AUTO_PUSH_ORDERS": "true",
            "MOBIZON_API_KEY": "real-key",
            "TELEGRAM_BOT_TOKEN_FOOD": "real-token",
        }
        with patch.dict(os.environ, unsafe, clear=True):
            errors = staging_safety_errors()
        self.assertTrue(any("STAGING_DATABASE_HOST" in error for error in errors))
        self.assertTrue(any("points to production" in error for error in errors))
        self.assertTrue(any("FRONTPAD_AUTO_PUSH_ORDERS" in error for error in errors))
        self.assertTrue(any("MOBIZON_API_KEY" in error for error in errors))
        self.assertTrue(any("Telegram credentials" in error for error in errors))

    def test_database_target_fingerprint_ignores_credentials(self):
        first = database_target_fingerprint("postgresql://one:secret-a@stage-db:5432/railway")
        second = database_target_fingerprint("postgresql://two:secret-b@stage-db:5432/railway")
        other = database_target_fingerprint("postgresql://one:secret-a@prod-db:5432/railway")
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)

    def test_non_staging_runtime_is_unchanged(self):
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=True):
            self.assertEqual(staging_safety_errors(), [])
            validate_runtime_safety()

    def test_external_side_effect_kill_switch(self):
        with patch.dict(os.environ, {"EXTERNAL_SIDE_EFFECTS": "disabled"}, clear=True):
            self.assertFalse(external_side_effects_allowed())
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(external_side_effects_allowed())

    def test_staging_requires_explicit_separate_storage(self):
        with patch.dict(
            os.environ,
            {**SAFE_STAGING, "CLOUDINARY_URL": "cloudinary://key:secret@production-cloud"},
            clear=True,
        ):
            errors = staging_safety_errors()
        self.assertTrue(any("STAGING_ALLOW_STORAGE" in error for error in errors))
        self.assertTrue(any("STAGING_CLOUDINARY_CLOUD_NAME" in error for error in errors))

        isolated = {
            **SAFE_STAGING,
            "STAGING_ALLOW_STORAGE": "true",
            "STAGING_CLOUDINARY_CLOUD_NAME": "sortirovka24-stage",
            "CLOUDINARY_URL": "cloudinary://key:secret@sortirovka24-stage",
        }
        with patch.dict(os.environ, isolated, clear=True):
            self.assertEqual(staging_safety_errors(), [])


if __name__ == "__main__":
    unittest.main()
