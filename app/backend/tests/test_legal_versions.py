"""Legal editions: the current one is accepted, the previous one too (transition), unknown ones are refused."""
import pytest
from fastapi import HTTPException

from core import legal


def test_current_and_previous_editions_are_accepted_with_their_own_hashes():
    now = legal.acceptance_payload(legal.LEGAL_VERSION, accepted=True, subject_name="Иванов Иван")
    old = legal.acceptance_payload("2026-10-09", accepted=True, subject_name="Иванов Иван")
    assert now["version"] == "2026-10-19" and old["version"] == "2026-10-09"
    assert now["documents"]["privacy"] != old["documents"]["privacy"]  # privacy text changed
    assert now["documents"]["terms"] == legal.MANIFEST["documents"]["ru"]["terms"]["sha256"]


def test_unknown_edition_is_refused():
    with pytest.raises(HTTPException) as err:
        legal.acceptance_payload("2025-01-01", accepted=True, subject_name="Иванов Иван")
    assert err.value.status_code == 409


def test_current_privacy_says_data_is_in_kazakhstan():
    doc = legal.MANIFEST["documents"]["ru"]["privacy"]["document"]
    text = " ".join(s["body"] for s in doc["sections"])
    assert "Hoster.kz" in text and "Railway" not in text
