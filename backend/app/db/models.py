from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class SnapshotRecord:
    id: str
    timestamp: str
    screenshotPath: str
    thumbnailPath: Optional[str]
    appName: Optional[str]
    windowTitle: Optional[str]
    screenHash: Optional[str]
    ocrText: Optional[str]
    ocrStatus: str
    ocrError: Optional[str]
    imageEmbeddingStatus: str
    createdAt: str
