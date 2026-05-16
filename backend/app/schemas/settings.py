from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


class Settings(BaseModel):
    captureEnabled: bool = False
    captureIntervalSeconds: int = Field(default=10, ge=2)
    retentionDays: int = Field(default=30, ge=1)
    backendUrl: Optional[str] = None
    ollamaModel: str = "gemma4:e2b"
    textEmbeddingModel: str = "nomic-embed-text"
    imageEmbeddingModel: str = "sentence-transformers/clip-ViT-B-32"
    enableOCR: bool = True
    enableImageEmbeddings: bool = True
    excludedApps: list[str] = []
    excludedWindowTitlePatterns: list[str] = []
