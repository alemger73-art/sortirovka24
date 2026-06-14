"""Tests for account profile validation helpers."""

from __future__ import annotations

import pytest

from services.account_profile import AvatarValidationError, normalize_avatar_url


def test_avatar_url_http():
    assert normalize_avatar_url("http://x/a.png") == "http://x/a.png"


def test_avatar_url_too_long():
    long_url = "https://example.com/" + ("a" * 3000)
    with pytest.raises(AvatarValidationError):
        normalize_avatar_url(long_url)
