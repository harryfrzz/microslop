from __future__ import annotations

from pydantic import BaseModel
from typing import Optional


class SnapshotResponse(BaseModel):
    status: str
    snapshotId: Optional[str] = None
    ocrStatus: Optional[str] = None
    textChunks: int = 0
    imageEmbeddingStatus: Optional[str] = None
    error: Optional[str] = None
