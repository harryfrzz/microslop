from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.core.paths import sqlite_path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(sqlite_path())
    conn.row_factory = sqlite3.Row
    return conn


def ping() -> bool:
    with connect() as conn:
        conn.execute("select 1")
    return True


def get_setting(key: str, default: Any = None) -> Any:
    with connect() as conn:
        row = conn.execute("select value from app_settings where key = ?", (key,)).fetchone()
    if row is None:
        return default
    try:
        return json.loads(row["value"])
    except json.JSONDecodeError:
        return row["value"]


def set_setting(key: str, value: Any) -> None:
    with connect() as conn:
        conn.execute(
            "insert into app_settings(key, value) values(?, ?) on conflict(key) do update set value = excluded.value",
            (key, json.dumps(value)),
        )


def list_exclusions() -> dict:
    with connect() as conn:
        apps = [r["appName"] for r in conn.execute("select appName from excluded_apps order by createdAt")]
        patterns = [r["pattern"] for r in conn.execute("select pattern from excluded_window_patterns order by createdAt")]
    return {"apps": apps, "patterns": patterns}


def replace_exclusions(apps: list[str], patterns: list[str]) -> None:
    import uuid

    with connect() as conn:
        conn.execute("delete from excluded_apps")
        conn.execute("delete from excluded_window_patterns")
        for app in apps:
            if app.strip():
                conn.execute("insert into excluded_apps values(?, ?, ?)", (str(uuid.uuid4()), app.strip(), utc_now()))
        for pattern in patterns:
            if pattern.strip():
                conn.execute("insert into excluded_window_patterns values(?, ?, ?)", (str(uuid.uuid4()), pattern.strip(), utc_now()))


def insert_snapshot(snapshot: dict) -> None:
    with connect() as conn:
        conn.execute(
            """
            insert into snapshots(id, timestamp, screenshotPath, thumbnailPath, appName, windowTitle, screenHash,
            ocrText, ocrStatus, ocrError, imageEmbeddingStatus, createdAt)
            values(:id, :timestamp, :screenshotPath, :thumbnailPath, :appName, :windowTitle, :screenHash,
            :ocrText, :ocrStatus, :ocrError, :imageEmbeddingStatus, :createdAt)
            """,
            snapshot,
        )


def insert_text_chunk(chunk: dict) -> None:
    with connect() as conn:
        conn.execute(
            "insert into text_chunks(id, snapshotId, chunkText, chunkIndex, createdAt) values(:id, :snapshotId, :chunkText, :chunkIndex, :createdAt)",
            chunk,
        )


def get_snapshot(snapshot_id: str) -> Optional[dict]:
    with connect() as conn:
        row = conn.execute("select * from snapshots where id = ?", (snapshot_id,)).fetchone()
    return dict(row) if row else None


def get_snapshots(ids: list[str]) -> list[dict]:
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    with connect() as conn:
        rows = conn.execute(f"select * from snapshots where id in ({placeholders})", ids).fetchall()
    by_id = {row["id"]: dict(row) for row in rows}
    return [by_id[i] for i in ids if i in by_id]


def stats() -> dict:
    today = datetime.now().date().isoformat()
    with connect() as conn:
        snapshots_today = conn.execute("select count(*) c from snapshots where timestamp like ?", (f"{today}%",)).fetchone()["c"]
        last = conn.execute("select timestamp from snapshots order by timestamp desc limit 1").fetchone()
    base = sqlite_path().parent
    storage = sum(p.stat().st_size for p in base.rglob("*") if p.is_file()) if base.exists() else 0
    return {"snapshotsToday": snapshots_today, "lastCapturedAt": last["timestamp"] if last else None, "storageUsedBytes": storage}


def find_duplicate(screen_hash: Optional[str]) -> bool:
    if not screen_hash:
        return False
    with connect() as conn:
        row = conn.execute("select id from snapshots where screenHash = ? limit 1", (screen_hash,)).fetchone()
    return row is not None


def snapshots_in_range(date_from: Optional[str], date_to: Optional[str]) -> list[dict]:
    where, args = [], []
    if date_from:
        where.append("timestamp >= ?")
        args.append(date_from)
    if date_to:
        where.append("timestamp <= ?")
        args.append(date_to)
    sql = "select * from snapshots" + (" where " + " and ".join(where) if where else "")
    with connect() as conn:
        rows = conn.execute(sql, args).fetchall()
    return [dict(r) for r in rows]


def delete_snapshots(ids: list[str]) -> list[dict]:
    rows = get_snapshots(ids)
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    with connect() as conn:
        conn.execute(f"delete from text_chunks where snapshotId in ({placeholders})", ids)
        conn.execute(f"delete from snapshots where id in ({placeholders})", ids)
    for row in rows:
        for key in ("screenshotPath", "thumbnailPath"):
            path = row.get(key)
            if path:
                try:
                    Path(path).unlink(missing_ok=True)
                except OSError:
                    pass
    return rows
