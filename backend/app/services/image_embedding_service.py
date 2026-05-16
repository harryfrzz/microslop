from __future__ import annotations

from functools import lru_cache

import numpy as np


@lru_cache(maxsize=1)
def _load_model(model_name: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def embed_image(image_path: str, model_name: str) -> list[float]:
    model = _load_model(model_name)
    vector = model.encode([image_path], normalize_embeddings=True)[0]
    return np.asarray(vector, dtype=float).tolist()


def embed_visual_query(query: str, model_name: str) -> list[float]:
    model = _load_model(model_name)
    vector = model.encode([query], normalize_embeddings=True)[0]
    return np.asarray(vector, dtype=float).tolist()
