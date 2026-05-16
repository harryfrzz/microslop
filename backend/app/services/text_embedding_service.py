from __future__ import annotations

from app.services.ollama_service import embed_text


def chunk_text(text: str, size: int = 800, overlap: int = 100) -> list[str]:
    normalized = " ".join((text or "").split())
    if not normalized:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        chunk = normalized[start : start + size].strip()
        if chunk:
            chunks.append(chunk)
        start += max(size - overlap, 1)
    return chunks


def embed_chunks(chunks: list[str], model: str) -> list[list[float]]:
    return [embed_text(chunk, model) for chunk in chunks]
