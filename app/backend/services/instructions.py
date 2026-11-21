"""Video instructions «Как пользоваться»: one list kept in instructions.json, newest first."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

SOURCE = Path(__file__).with_name("instructions.json")


@lru_cache(maxsize=1)
def listing() -> tuple[dict, ...]:
    return tuple(json.loads(SOURCE.read_text(encoding="utf-8")))


def get(slug: str) -> Optional[dict]:
    return next((item for item in listing() if item["slug"] == slug), None)
