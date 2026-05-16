from __future__ import annotations

import uuid
from typing import Any

import lancedb

from app.core.paths import lancedb_path


def connect():
    return lancedb.connect(str(lancedb_path()))


def ping() -> bool:
    db = connect()
    db.table_names()
    return True


def _open_or_create(name: str, rows: list[dict[str, Any]]):
    db = connect()
    if name in db.table_names():
        return db.open_table(name), False
    return db.create_table(name, rows), True


def add_text_memories(rows: list[dict]) -> None:
    if not rows:
        return
    table, created = _open_or_create("text_memories", rows)
    if not created:
        table.add(rows)


def add_image_memory(row: dict) -> None:
    table, created = _open_or_create("image_memories", [row])
    if not created:
        table.add([row])


def search_table(name: str, vector: list[float], top_k: int) -> list[dict]:
    db = connect()
    if name not in db.table_names():
        return []
    rows = db.open_table(name).search(vector).limit(top_k).to_list()
    for row in rows:
        distance = float(row.get("_distance", 0))
        row["score"] = 1 / (1 + distance)
    return rows


def delete_snapshot_vectors(snapshot_ids: list[str]) -> None:
    if not snapshot_ids:
        return
    db = connect()
    quoted = ", ".join(f"'{sid}'" for sid in snapshot_ids)
    for name in ("text_memories", "image_memories"):
        if name in db.table_names():
            try:
                db.open_table(name).delete(f"snapshotId in ({quoted})")
            except Exception:
                pass


def text_row(snapshot: dict, chunk: str, embedding: list[float]) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "snapshotId": snapshot["id"],
        "chunkText": chunk,
        "embedding": embedding,
        "timestamp": snapshot["timestamp"],
        "appName": snapshot.get("appName") or "",
        "windowTitle": snapshot.get("windowTitle") or "",
        "screenshotPath": snapshot["screenshotPath"],
        "thumbnailPath": snapshot.get("thumbnailPath") or "",
    }
