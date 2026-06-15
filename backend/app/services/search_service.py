from __future__ import annotations

from app.core.settings import get_app_settings
from app.db.sqlite_db import get_snapshots
from app.services.image_embedding_service import embed_visual_query
from app.services.lancedb_service import search_table
from app.services.text_embedding_service import embed_text
from app.services.ranking_service import combine


def _passes_filters(snapshot: dict, filters: dict) -> bool:
    if filters.get("dateFrom") and snapshot.get("timestamp", "") < filters["dateFrom"]:
        return False
    if filters.get("dateTo") and snapshot.get("timestamp", "") > filters["dateTo"]:
        return False
    if filters.get("appName") and filters["appName"].lower() not in (snapshot.get("appName") or "").lower():
        return False
    if filters.get("windowTitle") and filters["windowTitle"].lower() not in (snapshot.get("windowTitle") or "").lower():
        return False
    return True


def search_memories(query: str, mode: str, top_k: int, filters: dict) -> list[dict]:
    settings = get_app_settings()
    rows: list[dict] = []
    if mode in ("text", "hybrid"):
        vector = embed_text(query, settings["textEmbeddingModel"])
        rows.extend({**r, "matchType": "text"} for r in search_table("text_memories", vector, top_k * 3))
    if mode in ("visual", "hybrid"):
        try:
            image_vector = embed_visual_query(query, settings["imageEmbeddingModel"])
            rows.extend({**r, "matchType": "image"} for r in search_table("image_memories", image_vector, top_k * 3))
        except Exception:
            pass
    ranked = combine(query, rows)
    snapshots = {s["id"]: s for s in get_snapshots([r["snapshotId"] for r in ranked])}
    results = []
    for row in ranked:
        snapshot = snapshots.get(row["snapshotId"])
        if not snapshot or not _passes_filters(snapshot, filters):
            continue
        text = row.get("chunkText") or snapshot.get("ocrText") or ""
        results.append(
            {
                "snapshotId": snapshot["id"],
                "timestamp": snapshot["timestamp"],
                "appName": snapshot.get("appName"),
                "windowTitle": snapshot.get("windowTitle"),
                "screenshotPath": snapshot["screenshotPath"],
                "thumbnailPath": snapshot.get("thumbnailPath"),
                "ocrSnippet": text[:500],
                "score": round(float(row.get("score", 0)), 4),
                "matchType": row.get("matchType", "text"),
            }
        )
        if len(results) >= top_k:
            break
    return results
