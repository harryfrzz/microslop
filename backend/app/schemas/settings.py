from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


class Settings(BaseModel):
    captureEnabled: bool = False
    captureIntervalSeconds: int = Field(default=10, ge=2)
    retentionDays: int = Field(default=30, ge=1)
    backendUrl: Optional[str] = None
    cerebrasModel: str = "llama-3.3-70b"
    textEmbeddingModel: str = "BAAI/bge-small-en-v1.5"
    imageEmbeddingModel: str = "sentence-transformers/clip-ViT-B-32"
    enableOCR: bool = True
    enableImageEmbeddings: bool = True
    excludedApps: list[str] = []
    excludedWindowTitlePatterns: list[str] = []
