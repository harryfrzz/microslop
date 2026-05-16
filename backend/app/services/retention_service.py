from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.sqlite_db import delete_snapshots, snapshots_in_range
from app.services.lancedb_service import delete_snapshot_vectors


def delete_range(date_from: Optional[str], date_to: Optional[str]) -> int:
    rows = snapshots_in_range(date_from, date_to)
    ids = [r["id"] for r in rows]
    delete_snapshot_vectors(ids)
    delete_snapshots(ids)
    return len(ids)


def delete_since(delta: timedelta) -> int:
    start = (datetime.now(timezone.utc) - delta).isoformat()
    return delete_range(start, None)


def delete_today() -> int:
    start = datetime.now(timezone.utc).date().isoformat()
    return delete_range(start, None)


def cleanup_older_than(days: int) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return delete_range(None, cutoff)
