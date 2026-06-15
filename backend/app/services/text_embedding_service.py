from __future__ import annotations

from functools import lru_cache

import numpy as np


@lru_cache(maxsize=2)
def _load_model(model_name: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def embed_text(text: str, model: str) -> list[float]:
    encoder = _load_model(model)
    vector = encoder.encode([text], normalize_embeddings=True)[0]
    return np.asarray(vector, dtype=float).tolist()


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
