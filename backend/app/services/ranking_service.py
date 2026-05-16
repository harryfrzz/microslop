from __future__ import annotations

from datetime import datetime, timezone


def keyword_overlap(query: str, text: str) -> float:
    query_terms = {t.lower() for t in query.split() if len(t) > 2}
    if not query_terms:
        return 0.0
    text_terms = set((text or "").lower().split())
    return len(query_terms & text_terms) / len(query_terms)


def recency_score(timestamp: str) -> float:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        age_hours = max((datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds() / 3600, 0)
        return 1 / (1 + age_hours / 48)
    except Exception:
        return 0.0


def combine(query: str, rows: list[dict]) -> list[dict]:
    combined: dict[str, dict] = {}
    for row in rows:
        sid = row["snapshotId"]
        base = combined.setdefault(sid, {**row, "matchType": row.get("matchType", "text"), "score": 0.0})
        score = float(row.get("score", 0)) * 0.72
        score += recency_score(row.get("timestamp", "")) * 0.13
        score += keyword_overlap(query, row.get("chunkText", "")) * 0.15
        if score > base["score"]:
            base.update(row)
            base["score"] = score
        elif base.get("matchType") != row.get("matchType"):
            base["matchType"] = "hybrid"
    return sorted(combined.values(), key=lambda item: item["score"], reverse=True)
