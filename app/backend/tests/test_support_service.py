"""Unit tests for support settings service (no full app import)."""

from services.support_settings import (
    DEFAULT_SUPPORT_SETTINGS,
    public_settings_payload,
    settings_to_dict,
)


class _Row:
    def __init__(self, key: str, value: str):
        self.key = key
        self.value = value


def test_settings_to_dict_merges_defaults():
    rows = [_Row("iban", "KZ123456789012345678")]
    result = settings_to_dict(rows)
    assert result["iban"] == "KZ123456789012345678"
    assert result["recipient"] == DEFAULT_SUPPORT_SETTINGS["recipient"]


def test_public_settings_payload_shape():
    payload = public_settings_payload(DEFAULT_SUPPORT_SETTINGS)
    assert payload["promo_enabled"] is True
    assert payload["recipient"]
    assert payload["kaspi_qr_url"] == ""
    assert "iban" in payload


def test_public_settings_promo_disabled():
    settings = dict(DEFAULT_SUPPORT_SETTINGS)
    settings["promo_enabled"] = "false"
    payload = public_settings_payload(settings)
    assert payload["promo_enabled"] is False
