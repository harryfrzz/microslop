from __future__ import annotations

import hashlib
from typing import Optional

from app.db.sqlite_db import find_duplicate


def file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def is_duplicate(screen_hash: Optional[str]) -> bool:
    return find_duplicate(screen_hash)
