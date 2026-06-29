"""Unit tests for courier PIN helpers."""

from utils.courier_pin import hash_courier_pin, is_hashed_pin, mask_pin_for_api, maybe_hash_pin_value, verify_courier_pin


def test_maybe_hash_pin_value_hashes_plaintext():
    hashed = maybe_hash_pin_value("4321")
    assert hashed and is_hashed_pin(hashed)


def test_maybe_hash_pin_value_preserves_existing_hash():
    original = hash_courier_pin("4321")
    assert maybe_hash_pin_value(original) == original


def test_mask_pin_for_api_hides_hash():
    hashed = hash_courier_pin("4321")
    assert mask_pin_for_api(hashed) is None
    assert mask_pin_for_api("plain") == "plain"


def test_verify_courier_pin_rejects_empty():
    assert not verify_courier_pin(None, "1234")
    assert not verify_courier_pin("1234", "")
